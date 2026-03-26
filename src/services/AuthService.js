import bcrypt from 'bcryptjs';
import * as userModel from '../models/user.model.js';
import { sendMail } from '../utils/mailer.js';

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/* ===== FORGOT PASSWORD ===== */

export async function forgotPassword(email) {
  const user = await userModel.findByEmail(email);
  if (!user) throw new Error('Email not found.');

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await userModel.createOtp({
    user_id: user.id,
    otp_code: otp,
    purpose: 'reset_password',
    expires_at: expiresAt,
  });

  await sendMail({
    to: email,
    subject: 'Password Reset for Your Online Auction Account',
    html: `
      <p>Hi ${user.fullname},</p>
      <p>Your OTP code for password reset is: <strong>${otp}</strong></p>
      <p>This code will expire in 15 minutes.</p>
    `,
  });

  return user;
}

export async function verifyForgotOtp(email, otp) {
  const user = await userModel.findByEmail(email);

  const otpRecord = await userModel.findValidOtp({
    user_id: user.id,
    otp_code: otp,
    purpose: 'reset_password',
  });

  if (!otpRecord) throw new Error('Invalid or expired OTP.');

  await userModel.markOtpUsed(otpRecord.id);
}

export async function resendForgotOtp(email) {
  const user = await userModel.findByEmail(email);
  if (!user) throw new Error('User not found.');

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await userModel.createOtp({
    user_id: user.id,
    otp_code: otp,
    purpose: 'reset_password',
    expires_at: expiresAt,
  });

  await sendMail({
    to: email,
    subject: 'New OTP for Password Reset',
    html: `
      <p>Hi ${user.fullname},</p>
      <p>Your new OTP code for password reset is: <strong>${otp}</strong></p>
      <p>This code will expire in 15 minutes.</p>
    `,
  });
}

export async function resetPassword(email, new_password) {
  const user = await userModel.findByEmail(email);
  if (!user) throw new Error('User not found.');

  const hashedPassword = bcrypt.hashSync(new_password, 10);
  await userModel.update(user.id, { password_hash: hashedPassword });
}

/* ===== SIGNIN ===== */

export async function signin(email, password) {
  const user = await userModel.findByEmail(email);
  if (!user) throw new Error('Invalid email or password');

  const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
  if (!isPasswordValid) throw new Error('Invalid email or password');

  if (!user.email_verified) {
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await userModel.createOtp({
      user_id: user.id,
      otp_code: otp,
      purpose: 'verify_email',
      expires_at: expiresAt,
    });

    await sendMail({
      to: email,
      subject: 'Verify your Online Auction account',
      html: `
        <p>Hi ${user.fullname},</p>
        <p>Your OTP code is: <strong>${otp}</strong></p>
        <p>This code will expire in 15 minutes.</p>
      `,
    });

    return { needVerify: true, email };
  }

  return user;
}

/* ===== SIGNUP ===== */

export async function signup(data) {
  const { fullname, email, address, password } = data;

  const hashedPassword = bcrypt.hashSync(password, 10);

  const newUser = await userModel.add({
    email,
    fullname,
    address,
    password_hash: hashedPassword,
    role: 'bidder',
  });

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await userModel.createOtp({
    user_id: newUser.id,
    otp_code: otp,
    purpose: 'verify_email',
    expires_at: expiresAt,
  });

  await sendMail({
    to: email,
    subject: 'Verify your Online Auction account',
    html: `
      <p>Hi ${fullname},</p>
      <p>Your OTP code is: <strong>${otp}</strong></p>
    `,
  });

  return newUser;
}

/* ===== VERIFY EMAIL ===== */

export async function verifyEmail(email, otp) {
  const user = await userModel.findByEmail(email);

  const otpRecord = await userModel.findValidOtp({
    user_id: user.id,
    otp_code: otp,
    purpose: 'verify_email',
  });

  if (!otpRecord) throw new Error('Invalid or expired OTP.');

  await userModel.markOtpUsed(otpRecord.id);
  await userModel.verifyUserEmail(user.id);
}

export async function resendVerifyOtp(email) {
  const user = await userModel.findByEmail(email);
  if (!user) throw new Error('User not found.');

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await userModel.createOtp({
    user_id: user.id,
    otp_code: otp,
    purpose: 'verify_email',
    expires_at: expiresAt,
  });

  await sendMail({
    to: email,
    subject: 'New OTP for email verification',
    html: `<p>Your OTP: <b>${otp}</b></p>`,
  });
}