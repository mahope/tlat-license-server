/**
 * Products API routes (admin only)
 */

import { Router } from 'express';
import {
  createProduct,
  getProductById,
  getProductBySlug,
  getAllProducts,
  updateProduct,
  deleteProduct,
  getProductStats
} from '../services/product.js';

const router = Router();

// Middleware: require admin API key
const requireAdmin = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'unauthorized', message: 'Valid admin API key required' });
  }
  next();
};

router.use(requireAdmin);

/**
 * GET /api/admin/products
 * List all products
 */
router.get('/', (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const products = getAllProducts(includeInactive);
    
    // Add stats for each product
    const productsWithStats = products.map(p => ({
      ...p,
      stats: getProductStats(p.id)
    }));
    
    res.json({ products: productsWithStats });
  } catch (error) {
    console.error('Error listing products:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to list products' });
  }
});

/**
 * POST /api/admin/products
 * Create a new product
 */
router.post('/', (req, res) => {
  try {
    const { slug, name, description, currentVersion, downloadUrl } = req.body;
    
    if (!slug || !name) {
      return res.status(400).json({ error: 'missing_fields', message: 'slug and name are required' });
    }
    
    // Check if slug already exists
    const existing = getProductBySlug(slug);
    if (existing) {
      return res.status(409).json({ error: 'duplicate_slug', message: 'A product with this slug already exists' });
    }
    
    const product = createProduct({ slug, name, description, currentVersion, downloadUrl });
    res.status(201).json({ product });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to create product' });
  }
});

/**
 * GET /api/admin/products/:id
 * Get product by ID
 */
router.get('/:id', (req, res) => {
  try {
    const product = getProductById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ error: 'not_found', message: 'Product not found' });
    }
    
    const stats = getProductStats(product.id);
    res.json({ product: { ...product, stats } });
  } catch (error) {
    console.error('Error getting product:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to get product' });
  }
});

/**
 * PATCH /api/admin/products/:id
 * Update a product
 */
router.patch('/:id', (req, res) => {
  try {
    const product = getProductById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ error: 'not_found', message: 'Product not found' });
    }
    
    const { name, description, currentVersion, downloadUrl, isActive } = req.body;
    const updated = updateProduct(req.params.id, { name, description, currentVersion, downloadUrl, isActive });
    
    res.json({ product: updated });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to update product' });
  }
});

/**
 * DELETE /api/admin/products/:id
 * Soft-delete a product
 */
router.delete('/:id', (req, res) => {
  try {
    const product = getProductById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ error: 'not_found', message: 'Product not found' });
    }
    
    deleteProduct(req.params.id);
    res.json({ success: true, message: 'Product deactivated' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to delete product' });
  }
});

export default router;
