const express = require('express');
const { createTenant, getAllTenants, getTenant } = require('../services/tenantService');

const router = express.Router();

// POST /tenants - Create a new tenant
router.post('/', async (req, res) => {
    try {
        const { name, planId = 'plan-free' } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'name is required' });
        }
        
        const tenant = await createTenant(name, planId);
        res.status(201).json(tenant);
    } catch (error) {
        console.error('Error creating tenant:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /tenants - List all tenants
router.get('/', async (req, res) => {
    try {
        const tenants = await getAllTenants();
        res.json(tenants);
    } catch (error) {
        console.error('Error listing tenants:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /tenants/:id - Get a specific tenant
router.get('/:id', async (req, res) => {
    try {
        const tenant = await getTenant(req.params.id);
        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }
        res.json(tenant);
    } catch (error) {
        console.error('Error getting tenant:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
