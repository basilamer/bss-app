require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');

const app = express();
const port = 3000;

// MongoDB Connection
const uri = process.env.MONGO_URI;
let db;

MongoClient.connect(uri, { useUnifiedTopology: true })
    .then(client => {
        db = client.db('bss_app');
        console.log('Connected to MongoDB');
    })
    .catch(error => {
        console.error('Error connecting to MongoDB:', error);
        process.exit(1);
    });

// Middleware
app.use(bodyParser.json());

// API Key Middleware
const API_KEY = process.env.API_KEY;
app.use((req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== API_KEY) {
        return res.status(401).json({ message: 'Unauthorized: Invalid API Key' });
    }
    next();
});

// Routes

// Register new user
app.post('/users/register', async (req, res) => {
    try {
        const { address, initialBalance } = req.body;

        if (!address || !initialBalance) {
            return res.status(400).json({ message: 'Address and initial balance are required' });
        }

        // Check if user already exists
        const existingUser = await db.collection('users').findOne({ address });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Create a new user
        const newUser = {
            address,
            balance: initialBalance || 0, // Default balance is 0 if not provided
            createdAt: new Date(),
        };

        await db.collection('users').insertOne(newUser);

        res.status(201).json({ message: 'User registered successfully', user: newUser });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Get user balance
app.get('/balance/:address', async (req, res) => {
    try {
        const { address } = req.params;
        const user = await db.collection('users').findOne({ address });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ balance: user.balance });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Send transaction
app.post('/transactions/send', async (req, res) => {
    try {
        const { sender, receiver, amount } = req.body;

        if (!sender || !receiver || !amount) {
            return res.status(400).json({ message: 'Invalid request body' });
        }

        const senderUser = await db.collection('users').findOne({ address: sender });
        const receiverUser = await db.collection('users').findOne({ address: receiver });

        if (!senderUser || !receiverUser) {
            return res.status(404).json({ message: 'Sender or Receiver does not exist' });
        }

        if (senderUser.balance < amount) {
            return res.status(400).json({ message: 'Insufficient balance' });
        }

        await db.collection('users').updateOne({ address: sender }, { $inc: { balance: -amount } });
        await db.collection('users').updateOne({ address: receiver }, { $inc: { balance: +amount } });

        const transaction = {
            sender,
            receiver,
            amount,
            timestamp: new Date(),
        };

        await db.collection('transactions').insertOne(transaction);

        res.json({ message: 'Transaction successful', transaction });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Mine BSS
app.post('/mine', async (req, res) => {
    try {
        const { minerAddress } = req.body;

        if (!minerAddress) {
            return res.status(400).json({ message: 'Miner address is required' });
        }

        const miner = await db.collection('users').findOne({ address: minerAddress });
        if (!miner) {
            return res.status(404).json({ message: 'Miner does not exist' });
        }

        const reward = 10; // Reward for mining
        await db.collection('users').updateOne({ address: minerAddress }, { $inc: { balance: reward } });

        const block = {
            miner: minerAddress,
            reward,
            timestamp: new Date(),
        };

        await db.collection('blocks').insertOne(block);

        res.json({ message: 'Block mined successfully', block });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Get transactions for a specific user
app.get('/transactions/:address', async (req, res) => {
    try {
        const { address } = req.params;

        // Search for transactions sent or received by the address
        const transactions = await db.collection('transactions').find({
            $or: [
                { sender: address },
                { receiver: address }
            ]
        }).toArray();

        if (transactions.length === 0) {
            return res.status(404).json({ message: 'No transactions found for this user' });
        }

        res.json({ transactions });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Blockchain app listening at http://localhost:${port}`);
});
