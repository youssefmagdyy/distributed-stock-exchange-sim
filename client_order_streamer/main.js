const assert = require("assert");
const fs = require("fs");
const split2 = require("split2");
const amqp = require("amqplib/callback_api");

/** 
 * This file reads from the recorder client orders and emits requests to the specified endpoint
 **/

const RABBITMQ_URL = "amqp://guest:guest@rabbitmq-headless.default.svc.cluster.local";
const QUEUE_NAME = "client_order_manager";

let channel = null;

// Initialize the message queue to send orders to the order manager
function initRabbitMQ(callback) {
    amqp.connect(RABBITMQ_URL, (err, conn) => {
        if (err) {
            console.error("Error connecting to RabbitMQ:", err);
            process.exit(1);  // Fail the service if connection fails
        }
        
        conn.createChannel((err, ch) => {
            if (err) {
                console.error("Error creating RabbitMQ channel:", err);
                process.exit(1);
            }

            channel = ch;
            channel.assertQueue(QUEUE_NAME, {
                durable: true,
            });
            console.log("RabbitMQ connected and channel created.");

            callback();
        });
    });
}

/**
 * @param {String} line 
 * @returns {JSON}
 */
function parseLine(line) {
    let fields_array = line.split(",");
    assert.equal(fields_array.length, 7, "Expected 7 fields!");
    return {
        "user_id": fields_array[0],
        "timestamp_ns": fields_array[1],
        "price": fields_array[2],
        "symbol": fields_array[3],
        "quantity": fields_array[4],
        "side": fields_array[5],
        "trader_type": fields_array[6]
    }
}

function send(order_line) {
    const json_order = parseLine(order_line);
    channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(json_order)), {
        persistent: true,
    });
}

/**
 * Takes the dataset file's path and a callback that will process each line in the dataset 
 * e.g. the function send that takes the line and makes a network request.
 * @param {String} cvs_filepath 
 * @param {Function} record_handler 
 */
function processFileContents(cvs_filepath, record_handler) {
    const order_stream = fs.createReadStream(cvs_filepath, { encoding: "utf-8", start: 0 }).pipe(split2());
    order_stream.on("data", (line) => {
        record_handler(line);
    });
}

initRabbitMQ(() => {
    processFileContents("sample_orders.csv", send);
});