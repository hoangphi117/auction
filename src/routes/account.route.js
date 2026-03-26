import express from 'express';
import passport from '../utils/passport.js';
import { isAuthenticated } from '../middlewares/auth.mdw.js';

import * as authService from '../services/AuthService.js';
import * as userService from '../services/UserService.js';
import * as auctionService from '../services/AuctionService.js';

import { PaginationHelper } from '../utils/pagination.js';

const router = express.Router();

/* ===================== RATINGS ===================== */

router.get('/ratings', isAuthenticated, async (req, res) => {
  const currentUserId = req.session.authUser.id;

  const data = await auctionService.getRatings(currentUserId);

  res.render('vwAccount/rating', {
    activeSection: 'ratings',
    ...data
  });
});

/* ===================== AUTH VIEWS ===================== */

router.get('/signup', (req, res) => {
  res.render('vwAccount/auth/signup', {
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY
  });
});

router.get('/signin', (req, res) => {
  const success_message = req.session.success_message;
  delete req.session.success_message;

  res.render('vwAccount/auth/signin', { success_message });
});

router.get('/verify-email', (req, res) => {
  const { email } = req.query;

  if (!email) return res.redirect('/account/signin');

  res.render('vwAccount/auth/verify-otp', {
    email,
    info_message: 'We have sent an OTP to your email.'
  });
});

router.get('/forgot-password', (req, res) => {
  res.render('vwAccount/auth/forgot-password');
});

/* ===================== FORGOT PASSWORD ===================== */

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    await authService.forgotPassword(email);

    res.render('vwAccount/auth/verify-forgot-password-otp', { email });
  } catch (err) {
    res.render('vwAccount/auth/forgot-password', {
      error_message: err.message
    });
  }
});

router.post('/verify-forgot-password-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    await authService.verifyForgotOtp(email, otp);
    res.render('vwAccount/auth/reset-password', { email });
  } catch (err) {
    res.render('vwAccount/auth/verify-forgot-password-otp', {
      email,
      error_message: err.message
    });
  }
});

router.post('/resend-forgot-password-otp', async (req, res) => {
  const { email } = req.body;

  try {
    await authService.resendForgotOtp(email);

    res.render('vwAccount/auth/verify-forgot-password-otp', {
      email,
      info_message: 'We have sent a new OTP to your email.'
    });
  } catch (err) {
    res.render('vwAccount/auth/verify-forgot-password-otp', {
      email,
      error_message: err.message
    });
  }
});

router.post('/reset-password', async (req, res) => {
  const { email, new_password, confirm_new_password } = req.body;

  if (new_password !== confirm_new_password) {
    return res.render('vwAccount/auth/reset-password', {
      email,
      error_message: 'Passwords do not match.'
    });
  }

  try {
    await authService.resetPassword(email, new_password);

    res.render('vwAccount/auth/signin', {
      success_message: 'Your password has been reset.'
    });
  } catch (err) {
    res.render('vwAccount/auth/reset-password', {
      email,
      error_message: err.message
    });
  }
});

/* ===================== SIGNIN ===================== */

router.post('/signin', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await authService.signin(email, password);

    if (result.needVerify) {
      return res.redirect(`/account/verify-email?email=${encodeURIComponent(result.email)}`);
    }

    req.session.isAuthenticated = true;
    req.session.authUser = result;

    const returnUrl = req.session.returnUrl || '/';
    delete req.session.returnUrl;

    res.redirect(returnUrl);
  } catch (err) {
    res.render('vwAccount/auth/signin', {
      error_message: err.message,
      old: { email }
    });
  }
});

/* ===================== SIGNUP ===================== */

router.post('/signup', async (req, res) => {
  const { fullname, email, address, password, confirmPassword } = req.body;

  const errors = {};
  const old = { fullname, email, address };

  if (!fullname) errors.fullname = 'Full name is required';
  if (!address) errors.address = 'Address is required';
  if (!email) errors.email = 'Email is required';
  if (!password) errors.password = 'Password is required';
  if (password !== confirmPassword)
    errors.confirmPassword = 'Passwords do not match';

  if (Object.keys(errors).length > 0) {
    return res.render('vwAccount/auth/signup', {
      errors,
      old,
      error_message: 'Please correct the errors below.'
    });
  }

  try {
    await authService.signup({ fullname, email, address, password });

    res.redirect(`/account/verify-email?email=${encodeURIComponent(email)}`);
  } catch (err) {
    res.render('vwAccount/auth/signup', {
      error_message: err.message,
      old
    });
  }
});

/* ===================== VERIFY EMAIL ===================== */

router.post('/verify-email', async (req, res) => {
  const { email, otp } = req.body;

  try {
    await authService.verifyEmail(email, otp);

    req.session.success_message = 'Email verified. Please sign in.';
    res.redirect('/account/signin');
  } catch (err) {
    res.render('vwAccount/auth/verify-otp', {
      email,
      error_message: err.message
    });
  }
});

router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;

  try {
    await authService.resendVerifyOtp(email);

    res.render('vwAccount/auth/verify-otp', {
      email,
      info_message: 'New OTP sent.'
    });
  } catch (err) {
    res.render('vwAccount/auth/verify-otp', {
      email,
      error_message: err.message
    });
  }
});

/* ===================== PROFILE ===================== */

router.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const user = await userService.getProfile(req.session.authUser.id);

    let success_message = null;
    if (req.query.success === 'true') success_message = 'Profile updated successfully.';
    if (req.query['send-request-upgrade'] === 'true')
      success_message = 'Upgrade request sent.';

    res.render('vwAccount/profile', { user, success_message });
  } catch {
    res.render('vwAccount/profile', {
      user: req.session.authUser,
      err_message: 'Unable to load profile.'
    });
  }
});

router.put('/profile', isAuthenticated, async (req, res) => {
  try {
    const updatedUser = await userService.updateProfile(
      req.session.authUser.id,
      req.body
    );

    delete updatedUser.password_hash;
    req.session.authUser = updatedUser;

    res.redirect('/account/profile?success=true');
  } catch (err) {
    res.render('vwAccount/profile', {
      user: req.session.authUser,
      err_message: err.message
    });
  }
});

/* ===================== UPGRADE ===================== */

router.get('/request-upgrade', isAuthenticated, async (req, res) => {
  const upgrade_request = await userService.getUpgrade(req.session.authUser.id);
  res.render('vwAccount/request-upgrade', { upgrade_request });
});

router.post('/request-upgrade', isAuthenticated, async (req, res) => {
  try {
    await userService.requestUpgrade(req.session.authUser.id);
    res.redirect('/account/profile?send-request-upgrade=true');
  } catch {
    res.render('vwAccount/profile', {
      user: req.session.authUser,
      err_message: 'Unable to submit request.'
    });
  }
});

/* ===================== WATCHLIST ===================== */

router.get('/watchlist', isAuthenticated, async (req, res) => {
  const userId = req.session.authUser.id;

  const result = await PaginationHelper.paginate(
    req,
    (limit, offset) => userService.getWatchlist(userId, limit, offset),
    () => userService.countWatchlist(userId)
  );

  res.render('vwAccount/watchlist', {
    products: result.items,
    totalCount: result.totalCount,
    from: result.from,
    to: result.to,
    currentPage: result.currentPage,
    totalPages: result.totalPages
  });
});

/* ===================== BIDDING ===================== */

router.get('/bidding', isAuthenticated, async (req, res) => {
  const products = await auctionService.getBiddingProducts(req.session.authUser.id);

  res.render('vwAccount/bidding-products', {
    activeSection: 'bidding',
    products
  });
});

router.get('/auctions', isAuthenticated, async (req, res) => {
  const products = await auctionService.getWonAuctions(req.session.authUser.id);

  res.render('vwAccount/won-auctions', {
    activeSection: 'auctions',
    products
  });
});

router.post('/won-auctions/:productId/rate-seller', isAuthenticated, async (req, res) => {
  try {
    await auctionService.rateSeller(
      req.session.authUser.id,
      req.params.productId,
      req.body
    );

    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

router.put('/won-auctions/:productId/rate-seller', isAuthenticated, async (req, res) => {
  try {
    await auctionService.rateSeller(
      req.session.authUser.id,
      req.params.productId,
      req.body
    );

    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

/* ===================== LOGOUT ===================== */

router.post('/logout', isAuthenticated, (req, res) => {
  req.session.isAuthenticated = false;
  delete req.session.authUser;
  res.redirect('/');
});

/* ===================== OAUTH ===================== */

router.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/account/signin' }),
  (req, res) => {
    req.session.authUser = req.user;
    req.session.isAuthenticated = true;
    res.redirect('/');
  }
);

router.get('/auth/facebook',
  passport.authenticate('facebook', { scope: ['public_profile'] })
);

router.get('/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/account/signin' }),
  (req, res) => {
    req.session.authUser = req.user;
    req.session.isAuthenticated = true;
    res.redirect('/');
  }
);

router.get('/auth/github',
  passport.authenticate('github', { scope: ['user:email'] })
);

router.get('/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/account/signin' }),
  (req, res) => {
    req.session.authUser = req.user;
    req.session.isAuthenticated = true;
    res.redirect('/');
  }
);

export default router;