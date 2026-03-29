import express from 'express';
import * as AdminProductService from '../../services/AdminProductService.js';
import multer from 'multer';

const router = express.Router();

router.get('/list', async (req, res) => {
	const products = await AdminProductService.getAllProducts();
	const success_message = req.session.success_message;
	const error_message = req.session.error_message;
	delete req.session.success_message;
	delete req.session.error_message;

	res.render('vwAdmin/product/list', {
		products: products,
		empty: products.length === 0,
		success_message,
		error_message
	});
});

router.get('/add', async (req, res) => {
	try {
		const sellers = await AdminProductService.getSellers();
		res.render('vwAdmin/product/add', { sellers });
	} catch (error) {
		console.error('Error loading sellers:', error);
		res.render('vwAdmin/product/add', {
			sellers: [],
			error_message: 'Failed to load sellers list'
		});
	}
});

router.post('/add', async function (req, res) {
	try {
		await AdminProductService.createProduct(req.body);
		res.redirect('/admin/products/list');
	} catch (error) {
		console.error('Error creating product:', error);
		res.redirect('/admin/products/list');
	}
});

router.get('/detail/:id', async (req, res) => {
	const id = req.params.id;
	const product = await AdminProductService.getProductForAdmin(id);
	const success_message = req.session.success_message;
	const error_message = req.session.error_message;
	delete req.session.success_message;
	delete req.session.error_message;

	res.render('vwAdmin/product/detail', { product });
});

router.get('/edit/:id', async (req, res) => {
	const id = req.params.id;
	const product = await AdminProductService.getProductForAdmin(id);
	const sellers = await AdminProductService.getSellers();

	res.render('vwAdmin/product/edit', { product, sellers });
});

router.post('/edit', async (req, res) => {
	const newProduct = req.body;
	await AdminProductService.updateProduct(newProduct.id, newProduct);
	req.session.success_message = 'Product updated successfully!';
	res.redirect('/admin/products/list');
});

router.post('/delete', async (req, res) => {
	const { id } = req.body;
	await AdminProductService.deleteProduct(id);
	req.session.success_message = 'Product deleted successfully!';
	res.redirect('/admin/products/list');
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

router.post('/upload-thumbnail', upload.single('thumbnail'), async function (req, res) {
	res.json({
		success: true,
		file: req.file
	});
});

router.post('/upload-subimages', upload.array('images', 10), async function (req, res) {
	res.json({
		success: true,
		files: req.files
	});
});

export default router;