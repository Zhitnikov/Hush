const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

router.post('/register', async (req, res) => {
    const { username, password, publicKey } = req.body;
    try {
        let user = await User.findOne({ username });
        if (user) return res.status(400).json({ msg: 'User already exists' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        user = new User({
            username,
            password: hashedPassword,
            publicKey
        });

        await user.save();

        const payload = { userId: user.id, username: user.username };
        const token = jwt.sign(payload, process.env.JWT_SECRET || 'secretkey123', { expiresIn: '7d' });

        res.json({ token, user: { id: user.id, username: user.username, publicKey: user.publicKey } });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/update-key', require('../middleware/auth'), async (req, res) => {
    try {
        const { publicKey } = req.body;
        await User.findByIdAndUpdate(req.user.userId, { publicKey });
        res.json({ msg: 'Public key updated' });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username }).select('+password');
        if (!user) return res.status(400).json({ msg: 'Invalid Credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Invalid Credentials' });

        const payload = { userId: user.id, username: user.username };
        const token = jwt.sign(payload, process.env.JWT_SECRET || 'secretkey123', { expiresIn: '7d' });

        res.json({ token, user: { id: user.id, username: user.username, publicKey: user.publicKey } });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/me', require('../middleware/auth'), async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.put('/profile', require('../middleware/auth'), async (req, res) => {
    try {
        const { name, username, bio, profilePic } = req.body;
        const update = {};
        if (name !== undefined) update.name = name;
        if (username !== undefined) update.username = username;
        if (bio !== undefined) update.bio = bio;
        if (profilePic !== undefined) update.profilePic = profilePic;

        const user = await User.findByIdAndUpdate(req.user.userId, { $set: update }, { new: true }).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.put('/password', require('../middleware/auth'), async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user.userId).select('+password');

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Current password incorrect' });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.json({ msg: 'Password updated successfully' });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.post('/block', require('../middleware/auth'), async (req, res) => {
    try {
        const { targetId } = req.body;
        const user = await User.findById(req.user.userId);

        const index = user.blockedUsers.indexOf(targetId);
        if (index > -1) {
            user.blockedUsers.splice(index, 1);
            await user.save();
            res.json({ msg: 'User unblocked', blockedUsers: user.blockedUsers });
        } else {
            user.blockedUsers.push(targetId);
            await user.save();
            res.json({ msg: 'User blocked', blockedUsers: user.blockedUsers });
        }
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.get('/blacklist', require('../middleware/auth'), async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).populate('blockedUsers', 'username profilePic');
        res.json(user.blockedUsers);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.get('/user/:id', require('../middleware/auth'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('username profilePic bio name publicKey lastSeen');
        if (!user) return res.status(404).json({ msg: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

module.exports = router;
