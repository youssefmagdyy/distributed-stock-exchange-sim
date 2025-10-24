const express = require("express");
const bodyParser = require("body-parser");
const { MatchingEngine, EngineOrder } = require("./main");
const amqp = require("amqplib/callback_api");

const app = express();
const port = 3002;

app.use(bodyParser.json());

const symbols = ["AAPL", "GOOGL", "MSFT", "AMZN"];
const matchingEngine = new MatchingEngine(symbols);

const RABBITMQ_URL = "amqp://guest:guest@rabbitmq-headless.default.svc.cluster.local";
const MATCHING_ENGINE_ORDERS_QUEUE = "order_manager_matching_engine";
const FILLS_QUEUE = "matching_engine_order_manager";

let rabbitConnection = null;
let rabbitChannel = null;

function initRabbitMQ(callback) {
    amqp.connect(RABBITMQ_URL, (err, conn) => {
        if (err) {
            console.error("Failed to connect to RabbitMQ:", err.message);
            process.exit(1);
        }

        rabbitConnection = conn;

        conn.createChannel((err, channel) => {
            if (err) {
                console.error("Failed to create RabbitMQ channel:", err.message);
                process.exit(1);
            }

            rabbitChannel = channel;

            channel.assertQueue(MATCHING_ENGINE_ORDERS_QUEUE, { durable: true });
            channel.assertQueue(FILLS_QUEUE, { durable: true });

            console.log("RabbitMQ connection and channel are ready.");
            callback();
        });
    });
}

// Process executions (fills) and send them to the order manager
function handleExecutions(asks, bids) {
    if (asks.length === 0 && bids.length === 0) {
        return;
    }

    const fills = asks.map((ask, index) => ({
        ask,
        bid: bids[index]
    }));

    rabbitChannel.sendToQueue(
        FILLS_QUEUE,
        Buffer.from(JSON.stringify({ fills })),
        { persistent: true }
    );
}

function processOrders(msg) {
    try {
        const orderData = JSON.parse(msg.content.toString());

        const { symbol, side, price, quantity, order_id } = orderData;

        if (!symbols.includes(symbol)) {
            console.error(`Unsupported symbol: ${symbol}`);
            // channel.nack(msg, false, true);
            return;
        }

        const order = new EngineOrder(symbol, side, price, quantity, order_id);
        matchingEngine.execute(order, handleExecutions);

        rabbitChannel.ack(msg);
    } catch (error) {
        console.error("Error processing order:", error.message);
        rabbitChannel.nack(msg, false, true);
    }
}

// Consume and process orders from the order manager
function startRabbitMQOrderConsumer() {
    if (rabbitChannel) {
        rabbitChannel.consume(MATCHING_ENGINE_ORDERS_QUEUE, processOrders, { noAck: false });
        console.log(`Listening for orders on queue: ${MATCHING_ENGINE_ORDERS_QUEUE}`);
    } else {
        console.error("RabbitMQ channel is not ready.");
    }
}

initRabbitMQ(startRabbitMQOrderConsumer);

app.get("/", (req, res) => {
    res.status(200).json({ status: "Healthy" });
});

app.listen(port, () => {
    console.log(`Matching Engine running on http://localhost:${port}`);
});
