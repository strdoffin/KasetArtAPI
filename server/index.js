require('dotenv').config();
const express = require("express");
const mqtt = require("mqtt");
const cors = require("cors");
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = 3000;

app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:3001',
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const brokerUrl =  process.env.BROKER_URL
const clientId =  process.env.CLIENT_ID
const username =  process.env.USERNAME
const password =  process.env.PASSWORD
const topic =  process.env.TOPIC

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
                        timestamp: new Date()
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

client.on("close", () => {
    console.log("Connection to MQTT broker closed");
});

// API endpoints
app.get("/data", (req, res) => {
    if (latestMessage) {
        res.json(latestMessage);
    } else {
        res.status(404).json({ error: "No data received yet" });
    }
});

// Endpoint to get daily averages
app.get("/daily-averages", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('sensor_readings')
            .select('timestamp, temperature, humidity')
            .order('timestamp', { ascending: false });
        if (error) {
            throw error;
        }
        
        // Process data to calculate daily averages
        const dailyMap = new Map();
        
        data.forEach(reading => {
            const date = new Date(reading.timestamp).toISOString().split('T')[0];
            
            if (!dailyMap.has(date)) {
                dailyMap.set(date, {
                    total_temp: 0,
                    total_humi: 0,
                    count: 0
                });
            }
            
            const dayData = dailyMap.get(date);
            dayData.total_temp += reading.temperature;
            dayData.total_humi += reading.humidity;
            dayData.count += 1;
        });
        
        const dailyAverages = Array.from(dailyMap.entries()).map(([date, data]) => {
            return {
                date,
                avg_temp: data.total_temp / data.count,
                avg_humi: data.total_humi / data.count
            };
        });
        
        res.json(dailyAverages);
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