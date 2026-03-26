/* ===== SIGNUP ===== */
export function validateSignup(req, res, next) {
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

  next();
}

/* ===== RESET PASSWORD ===== */
export function validateResetPassword(req, res, next) {
  const { email, new_password, confirm_new_password } = req.body;

  if (new_password !== confirm_new_password) {
    return res.render('vwAccount/auth/reset-password', {
      email,
      error_message: 'Passwords do not match.'
    });
  }

  next();
}

/* ===== VERIFY OTP ===== */
export function validateOtp(req, res, next) {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.render('vwAccount/auth/verify-otp', {
      email,
      error_message: 'Invalid request'
    });
  }

  next();
}