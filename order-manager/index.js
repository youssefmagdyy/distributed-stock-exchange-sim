const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const Redis = require("ioredis");
const amqp = require("amqplib/callback_api");

const app = express();
const port = 3001;

const redis = new Redis({
    host: "redis",
    port: 6379,
    db: 0
});

const RABBITMQ_URL = "amqp://guest:guest@rabbitmq-headless.default.svc.cluster.local";
const CLIENT_ORDERS_QUEUE = "client_order_manager";
const FILLS_QUEUE = "matching_engine_order_manager";
const MATCHING_ENGINE_ORDERS_QUEUE = "order_manager_matching_engine";
const MARKET_DATA_PUBLISHER_FILLS_QUEUE = "order_manager_market_data_publisher_fills";
const MARKET_DATA_PUBLISHER_ORDERS_QUEUE = "order_manager_market_data_publisher_orders";

let rabbitConnection = null;
let rabbitChannel = null;

function initRabbitMQ(callback) {
    amqp.connect(RABBITMQ_URL, (err, conn) => {
        if (err) {
            console.error("Error connecting to RabbitMQ:", err);
            process.exit(1);
        }

        rabbitConnection = conn;

        conn.createChannel((err, channel) => {
            if (err) {
                console.error("Error creating RabbitMQ channel:", err);
                process.exit(1);
            }

            rabbitChannel = channel;

            channel.assertQueue(CLIENT_ORDERS_QUEUE, { durable: true });
            channel.assertQueue(FILLS_QUEUE, { durable: true });
            channel.assertQueue(MATCHING_ENGINE_ORDERS_QUEUE, { durable: true });
            channel.assertQueue(MARKET_DATA_PUBLISHER_FILLS_QUEUE, { durable: true });
            channel.assertQueue(MARKET_DATA_PUBLISHER_ORDERS_QUEUE, { durable: true });

            console.log("RabbitMQ connection and channel established.");
            callback();

        });
    });
}

// Send a message based on a queue name
function forwardToQueue(queueName, data) {
    if (!rabbitChannel) {
        console.error("Channel not initialized.");
        process.exit(1);
    }

    rabbitChannel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)), { persistent: true });
}

function forwardFillToMarketDataPublisher(fill) {
    forwardToQueue(MARKET_DATA_PUBLISHER_FILLS_QUEUE, fill);
}

function forwardOrderToMarketDataPublisher(order) {
    forwardToQueue(MARKET_DATA_PUBLISHER_ORDERS_QUEUE, order);
}

function forwardOrderToMatchingEngine(order) {
    forwardToQueue(MATCHING_ENGINE_ORDERS_QUEUE, order);
}

function processOrder(order) {
    const { price, symbol, quantity, side } = order;

    return redis.incr("order_id_counter").then(orderId => ({
        order_id: orderId,
        price: parseFloat(price),
        symbol,
        quantity: parseInt(quantity, 10),
        side
    }));
}

// Process fills from matching engine
function startRabbitMQFillsConsumer() {
    rabbitChannel.consume(FILLS_QUEUE, (msg) => {
        if (msg !== null) {
            const { fills } = JSON.parse(msg.content.toString());
            fills.forEach(fill => forwardFillToMarketDataPublisher(fill));
            rabbitChannel.ack(msg);
        }
    });
    console.log(`Listening for fills on queue: ${FILLS_QUEUE}`);
}

// Consume orders from client
function startRabbitMQOrdersConsumer() {
    rabbitChannel.consume(CLIENT_ORDERS_QUEUE, async (msg) => {
        if (msg !== null) {
            try {
                const order = JSON.parse(msg.content.toString());
                const processedOrder = await processOrder(order);
                const orderKey = `order:${processedOrder.order_id}`;
                await redis.hmset(orderKey, processedOrder);

                if (processedOrder.side === "ask") {
                    await redis.rpush("orderBook:asks", processedOrder.order_id);
                } else if (processedOrder.side === "bid") {
                    await redis.rpush("orderBook:bids", processedOrder.order_id);
                }

                forwardOrderToMatchingEngine(processedOrder);
                forwardOrderToMarketDataPublisher(processedOrder);

                rabbitChannel.ack(msg);
            } catch (error) {
                console.error("Error processing order:", error.message);
                rabbitChannel.nack(msg, false, true);
            }
        }
    });
    console.log(`Listening for orders on queue: ${CLIENT_ORDERS_QUEUE}`);
}

initRabbitMQ(() => {
    startRabbitMQOrdersConsumer();
    startRabbitMQFillsConsumer();
});

app.use(bodyParser.json());

app.get("/", (req, res) => {
    res.status(200).json({ status: "Healthy" });
});

app.listen(port, () => {
    console.log(`Order Manager running on http://localhost:${port}`);
});

