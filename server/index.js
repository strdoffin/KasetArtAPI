require('dotenv').config();
const express = require("express");
const mqtt = require("mqtt");
const cors = require("cors");
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = 3000;

// CORS Configuration
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? process.env.CORS_ORIGINS.split(',')
        : ['http://localhost:3000', 'http://localhost:3001'], // Local development origins
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// Supabase Setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// MQTT Setup
const brokerUrl = "wss://mqtt.netpie.io:443/mqtt";
const clientId = "1589f4d7-9026-4799-a4c8-cf5cb6cf69fb";
const username = "3dHteifcwturssZ57Dgj28gKMrhV6YSt";
const password = "zWs6BRy7mzHFhTTxj3Pa2AuNwS8F5kGh";
const topic = "@msg/sayhi";

let latestMessage = null;

const client = mqtt.connect(brokerUrl, {
    clientId,
    username,
    password,
    protocol: 'wss',
});

client.on("connect", () => {
    console.log("Connected to MQTT broker");

    client.subscribe(topic, (err) => {
        if (err) {
            console.error("Failed to subscribe:", err);
        } else {
            console.log(`Subscribed to topic: ${topic}`);
        }
    });
});

client.on("message", async (receivedTopic, message) => {
    if (receivedTopic === topic) {
        try {
            latestMessage = JSON.parse(message.toString());
            console.log(`Received message:`, latestMessage);

            const { data, error } = await supabase
                .from('sensor_readings')
                .insert([
                    { 
                        temperature: latestMessage.temp, 
                        humidity: latestMessage.humi,
                        timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
                    }
                ]);

            if (error) {
                console.error("Error inserting message into Supabase:", error);
            } else {
                console.log("Successfully inserted data into Supabase");
            }
        } catch (error) {
            console.error("Error parsing message:", error);
        }
    }
});

client.on("error", (err) => {
    console.error("MQTT client error:", err);
});


// API endpoints
app.get("/data", (req, res) => {
    if (latestMessage) {
        res.json(latestMessage);
    } else {
        res.status(404).json({ error: "No data received yet" });
    }
});
app.get("/dailyavg", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('daily_averages')
            .select('*')
            .order('date', { ascending: false });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error("Error fetching daily averages:", error);
        res.status(500).json({ error: "Failed to fetch daily averages" });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Closing MQTT connection and exiting...');
    client.end(true, () => {
        process.exit(0);
    });
});
