import express from 'express';
import * as sellerService from '../services/sellerService.js';
import { sendMail } from '../utils/mailer.js';
import { asyncHandler, NotFoundError, UnauthorizedError, ValidationError } from '../middlewares/async-handler.js';
import multer from 'multer';

const router = express.Router();

router.get('/', async function (req, res) {
    const sellerId = req.session.authUser.id;
    const stats = await sellerService.getDashboard(sellerId);
    res.render('vwSeller/dashboard', { stats });
});

// All Products - View only
router.get('/products', async function (req, res) {
    const sellerId = req.session.authUser.id;
    const products = await sellerService.getAllProducts(sellerId);
    res.render('vwSeller/all-products', { products });
});

// Active Products - CRUD
router.get('/products/active', async function (req, res) {
    const sellerId = req.session.authUser.id;
    const products = await sellerService.getActiveProducts(sellerId);
    res.render('vwSeller/active', { products });
});

// Pending Products - Waiting for payment
router.get('/products/pending', async function (req, res) {
    const sellerId = req.session.authUser.id;
    
    const { products, stats } = await sellerService.getPendingProducts(sellerId);

    // Lấy message từ query param
    let success_message = '';
    if (req.query.message === 'cancelled') {
        success_message = 'Auction cancelled successfully!';
    }
    
    res.render('vwSeller/pending', { products, stats, success_message });
});

// Sold Products - Paid successfully
router.get('/products/sold', async function (req, res) {
    const sellerId = req.session.authUser.id;
    const { products, stats } = await sellerService.getSoldProducts(sellerId);
    
    res.render('vwSeller/sold-products', { products, stats });
});

// Expired Products - No bidder or cancelled
router.get('/products/expired', async function (req, res) {
    const sellerId = req.session.authUser.id;
    const products = await sellerService.getExpiredProducts(sellerId);
    
    res.render('vwSeller/expired', { products });
});

router.get('/products/add', async function (req, res) {
    const success_message = req.session.success_message;
    delete req.session.success_message; // Xóa message sau khi hiển thị
    res.render('vwSeller/add', { success_message });
});

router.post('/products/add', async function (req, res) {
  try {
     const sellerId = req.session.authUser.id;

    await sellerService.createProduct(req.body, sellerId);

    req.session.success_message = 'Product added successfully!';
    res.redirect('/seller/products/add');
  } catch (error) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

router.post('/products/upload-thumbnail', upload.single('thumbnail'), async function (req, res) {
    res.json({
        success: true,
        file: req.file
    });
});

router.post('/products/upload-subimages', upload.array('images', 10), async function (req, res) {
    res.json({
        success: true,
        files: req.files
    });
});

// Cancel Product
router.post('/products/:id/cancel', asyncHandler(async (req, res) => {
    await sellerService.cancelProduct(req.params.id, req.session.authUser.id, req.body);
    res.json({ success: true });
}));

// Rate Bidder
router.post('/products/:id/rate', asyncHandler(async (req, res) => {
  await sellerService.rateBidder(req.params.id, req.session.authUser.id, req.body);
  res.json({ success: true, message: 'Rating submitted successfully' });
}));

// Update Bidder Rating
router.put('/products/:id/rate', asyncHandler(async (req, res) => {
  await sellerService.updateBidderRating(req.params.id, req.session.authUser.id, req.body);
  res.json({ success: true, message: 'Rating updated successfully' });
}));

// Append Description to Product
router.post('/products/:id/append-description', asyncHandler(async (req, res) => {
 await sellerService.appendDescription(
        req.params.id,
        req.session.authUser.id,
        req.body,
        req
    );
  res.json({ success: true, message: 'Description appended successfully' });
}));

// Get Description Updates for a Product
router.get('/products/:id/description-updates', asyncHandler(async (req, res) => {
  
  const updates = await sellerService.getDescriptionUpdates(req.params.id, req.session.authUser.id);  
  res.json({ success: true, updates });
}));

// Update a Description Update
router.put('/products/description-updates/:updateId', async function (req, res) {
    try {
        await sellerService.updateDescription(req.params.updateId, req.session.authUser.id, req.body);
        res.json({ success: true, message: 'Update saved successfully' ,});
    } catch (error) {
        console.error('Update description error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete a Description Update
router.delete('/products/description-updates/:updateId', async function (req, res) {
    try {
        await sellerService.deleteDescription(req.params.updateId, req.session.authUser.id);
        res.json({ success: true, message: 'Update deleted successfully' });
    } catch (error) {
        console.error('Delete description error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;