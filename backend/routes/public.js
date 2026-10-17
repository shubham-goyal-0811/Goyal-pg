/**
 * public.js — read-only data for the public landing page. No auth.
 *
 * Everything served here is something the owner would print on a board
 * outside the gate. Nothing about residents, rooms by number, or occupancy.
 */
const express = require('express');
const router = express.Router();
const { getPricing } = require('../services/publicPricing');

router.get('/pricing', async (req, res) => {
  try {
    const body = await getPricing();
    // no-cache means "check before using", not "don't store". The browser keeps
    // its copy and revalidates with the ETag Express adds to every res.json; an
    // unchanged price list comes back as a bodiless 304, answered from memory.
    // A long max-age is avoided on purpose — it is the one cache the office
    // could not clear after changing a price.
    res.set('Cache-Control', 'no-cache');
    res.json(body);
  } catch (err) {
    console.error('[public/pricing]', err.message);
    // The page has a "call for current rent" fallback for exactly this.
    res.status(503).json({ error: 'Pricing is temporarily unavailable' });
  }
});

module.exports = router;
