const express = require('express');
const router = express.Router();
const { authLimiter } = require('../middleware/rateLimit');
const auth = require('../middleware/auth');
const authService = require('../services/authService');

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    res.json(await authService.registerUser(req.body));
  } catch (err) {
    next(err);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    res.json(await authService.loginUser(req.body));
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', authLimiter, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ msg: 'Refresh token required' });
    res.json(await authService.refreshSession(refreshToken));
  } catch (err) {
    next(err);
  }
});

router.post('/logout', auth, async (req, res, next) => {
  try {
    res.json(await authService.logoutUser(req.user.userId, req.body.refreshToken));
  } catch (err) {
    next(err);
  }
});

router.post('/update-key', auth, async (req, res, next) => {
  try {
    res.json(await authService.updatePublicKey(req.user.userId, req.body.publicKey));
  } catch (err) {
    next(err);
  }
});

router.get('/me', auth, async (req, res, next) => {
  try {
    res.json(await authService.getProfile(req.user.userId));
  } catch (err) {
    next(err);
  }
});

router.put('/profile', auth, async (req, res, next) => {
  try {
    res.json(await authService.updateProfile(req.user.userId, req.body));
  } catch (err) {
    next(err);
  }
});

router.put('/password', auth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    res.json(await authService.changePassword(req.user.userId, currentPassword, newPassword));
  } catch (err) {
    next(err);
  }
});

router.post('/block', auth, async (req, res, next) => {
  try {
    res.json(await authService.toggleBlock(req.user.userId, req.body.targetId));
  } catch (err) {
    next(err);
  }
});

router.get('/blacklist', auth, async (req, res, next) => {
  try {
    res.json(await authService.getBlacklist(req.user.userId));
  } catch (err) {
    next(err);
  }
});

router.get('/user/:id', auth, async (req, res, next) => {
  try {
    res.json(await authService.getUserById(req.params.id));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
