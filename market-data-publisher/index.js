const express = require("express");
const bodyParser = require("body-parser");
const { WebSocketServer } = require("ws");
const Redis = require("ioredis");
const amqp = require("amqplib/callback_api");

const app = express();
const port = 3003;

const redis = new Redis({
    host: "redis",
    port: 6379,
    db: 0
});

const RABBITMQ_URL = "amqp://guest:guest@rabbitmq-headless.default.svc.cluster.local";
const MARKET_DATA_PUBLISHER_FILLS_QUEUE = "order_manager_market_data_publisher_fills";
const MARKET_DATA_PUBLISHER_ORDERS_QUEUE = "order_manager_market_data_publisher_orders";

app.use(bodyParser.json());

const subscribers = new Set(); 

async function initializeOrderBook(symbol) {
    const orderBookExists = await redis.exists(`orderBook:${symbol}`);
    if (!orderBookExists) {
        await redis.hmset(`orderBook:${symbol}`, {
            asks: JSON.stringify([]),
            bids: JSON.stringify([]),
        });
    }
}

function broadcastUpdate(updateType, payload) {
    const message = JSON.stringify({ type: updateType, payload });
    subscribers.forEach(ws => {
        if (ws.readyState === ws.OPEN) {
            ws.send(message);
        }
    });
}

async function processOrders(msg) {
    try {
        const order = JSON.parse(msg.content.toString());
        const { order_id, symbol, side, price, quantity } = order;

        // Ensure order book is initialized
        await initializeOrderBook(symbol);

        const orderBook = await redis.hgetall(`orderBook:${symbol}`);

        let orderList = [];
        let updatedOrderBook = {};

        if (side === 'ask') {
            orderList = orderBook['asks'] ? JSON.parse(orderBook['asks']) : [];
        } else if (side === 'bid') {
            orderList = orderBook['bids'] ? JSON.parse(orderBook['bids']) : [];
        }

        const newOrder = { order_id, price, quantity };
        orderList.push(newOrder);

        if (side === 'ask') {
            updatedOrderBook = {
                asks: JSON.stringify(orderList),
                bids: orderBook['bids'] || JSON.stringify([])
            };
        } else if (side === 'bid') {
            updatedOrderBook = {
                bids: JSON.stringify(orderList),
                asks: orderBook['asks'] || JSON.stringify([])
            };
        }

        await redis.hmset(`orderBook:${symbol}`, updatedOrderBook);

        broadcastUpdate("order_book_update", { symbol,
            orderBook: {asks: JSON.parse(updatedOrderBook.asks), bids: JSON.parse(updatedOrderBook.bids)}
        });
        channel.ack(msg);

    } catch (error) {
        console.error("Error processing order from queue:", error.message);
        channel.nack(msg, false, true);
    }
}

async function processFills(msg) {
    try {
        const fill = JSON.parse(msg.content.toString());
        const { ask, bid } = fill;
        const symbol = ask.symbol;

        const logEntry = { ask, bid, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })};
        await redis.rpush(`executionLog:${symbol}`, JSON.stringify(logEntry));

        const orderBook = await redis.hgetall(`orderBook:${symbol}`);

        let asks = JSON.parse(orderBook.asks || '[]');
        let bids = JSON.parse(orderBook.bids || '[]');

        // Remove executed orders
        asks = asks.filter(order => order.order_id !== ask.secnum);
        bids = bids.filter(order => order.order_id !== bid.secnum);

        await redis.hmset(`orderBook:${symbol}`, {
            asks: JSON.stringify(asks),
            bids: JSON.stringify(bids),
        });

        broadcastUpdate("execution_update", { symbol, execution: logEntry });
        broadcastUpdate("order_book_update", { symbol, orderBook: { asks, bids } });
        channel.ack(msg);

    } catch (error) {
        console.error("Error processing fill from queue:", error.message);
        channel.nack(msg, false, true);
    }
}

function initRabbitMQ() {
    amqp.connect(RABBITMQ_URL, (err, conn) => {
        if (err) {
            console.error("Error connecting to RabbitMQ:", err);
            process.exit(1);
        }

        conn.createChannel((err, ch) => {
            if (err) {
                console.error("Error creating RabbitMQ channel:", err);
                process.exit(1);
            }

            channel = ch;
            channel.assertQueue(MARKET_DATA_PUBLISHER_ORDERS_QUEUE, { durable: true });
            channel.assertQueue(MARKET_DATA_PUBLISHER_FILLS_QUEUE, { durable: true });

            console.log("RabbitMQ connection and channel are ready.");

            channel.consume(MARKET_DATA_PUBLISHER_ORDERS_QUEUE, processOrders, { noAck: false });
            channel.consume(MARKET_DATA_PUBLISHER_FILLS_QUEUE, processFills, { noAck: false });
        });
    });
}

initRabbitMQ();

app.get("/", (req, res) => {
    res.status(200).json({ status: "Healthy" });
});

const wss = new WebSocketServer({ noServer: true });
wss.on("connection", ws => {
    subscribers.add(ws);

    ws.on("close", () => {
        subscribers.delete(ws);
    });

    ws.send(JSON.stringify({ type: "connection_ack", message: "Connected to Market Data Publisher" }));
});

const server = app.listen(port, () => {
    console.log(`Market Data Publisher running on http://localhost:${port}`);
});
server.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, ws => {
        wss.emit("connection", ws, req);
    });
});
