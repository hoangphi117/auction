import { sendMail } from '../utils/mailer.js';

class EmailService {
  static getBaseEmailTemplate(title, headerColor1, headerColor2, content) {
    return `
<!DOCTYPE html>
<html>
<head>
<style>
.email-container { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }
.email-header { padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
.email-body { background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
.email-footer { color: #888; font-size: 12px; text-align: center; margin-top: 20px; }
</style>
</head>
<body>
<div class="email-container">
  <div class="email-header" style="background: linear-gradient(135deg, ${headerColor1} 0%, ${headerColor2} 100%);">
    <h1 style="color: white; margin: 0;">${title}</h1>
  </div>
  <div class="email-body">
    ${content}
  </div>
  <div class="email-footer">
    This is an automated message from Online Auction.
  </div>
</div>
</body>
</html>
    `.trim();
  }

  static async sendBidNotificationToSeller(seller, productName, currentBidder, newCurrentPrice, previousPrice, productUrl, productSold) {
    const content = `
<p>Dear <strong>${seller.fullname}</strong>,</p>
<p>Great news! Your product has received a new bid:</p>
<div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #72AEC8;">
  <h3 style="margin: 0 0 15px 0; color: #333;">${productName}</h3>
  <p style="margin: 5px 0;"><strong>Bidder:</strong> ${currentBidder ? currentBidder.fullname : 'Anonymous'}</p>
  <p style="margin: 5px 0;"><strong>Current Price:</strong></p>
  <p style="font-size: 28px; color: #72AEC8; margin: 5px 0; font-weight: bold;">
    ${new Intl.NumberFormat('en-US').format(newCurrentPrice)} VND
  </p>
  ${previousPrice !== newCurrentPrice ? `
  <p style="margin: 5px 0; color: #666; font-size: 14px;">
    <i>Previous: ${new Intl.NumberFormat('en-US').format(previousPrice)} VND</i>
  </p>
  ` : ''}
</div>
${productSold ? `
<div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 15px 0;">
  <p style="margin: 0; color: #155724;"><strong>🎉 Buy Now price reached!</strong> Auction has ended.</p>
</div>
` : ''}
<div style="text-align: center; margin: 30px 0;">
  <a href="${productUrl}" style="display: inline-block; background: linear-gradient(135deg, #72AEC8 0%, #5a9ab8 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
    View Product
  </a>
</div>
    `.trim();

    const html = this.getBaseEmailTemplate('New Bid Received!', '#72AEC8', '#5a9ab8', content);

    return sendMail({
      to: seller.email,
      subject: `💰 New bid on your product: ${productName}`,
      html
    });
  }

  static async sendBidConfirmationToBidder(bidder, productName, bidAmount, newCurrentPrice, isWinning, productUrl, productSold) {
    const headerColor1 = isWinning ? '#28a745' : '#ffc107';
    const headerColor2 = isWinning ? '#218838' : '#e0a800';
    const title = isWinning ? "You're Winning!" : "Bid Placed";
    const borderColor = isWinning ? '#28a745' : '#ffc107';

    const content = `
<p>Dear <strong>${bidder.fullname}</strong>,</p>
<p>${isWinning 
  ? 'Congratulations! Your bid has been placed and you are currently the highest bidder!' 
  : 'Your bid has been placed. However, another bidder has a higher maximum bid.'}</p>
<div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid ${borderColor};">
  <h3 style="margin: 0 0 15px 0; color: #333;">${productName}</h3>
  <p style="margin: 5px 0;"><strong>Your Max Bid:</strong> ${new Intl.NumberFormat('en-US').format(bidAmount)} VND</p>
  <p style="margin: 5px 0;"><strong>Current Price:</strong></p>
  <p style="font-size: 28px; color: ${borderColor}; margin: 5px 0; font-weight: bold;">
    ${new Intl.NumberFormat('en-US').format(newCurrentPrice)} VND
  </p>
</div>
${productSold && isWinning ? `
<div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 15px 0;">
  <p style="margin: 0; color: #155724;"><strong>🎉 Congratulations! You won this product!</strong></p>
  <p style="margin: 10px 0 0 0; color: #155724;">Please proceed to complete your payment.</p>
</div>
` : ''}
${!isWinning ? `
<div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0;">
  <p style="margin: 0; color: #856404;"><strong>💡 Tip:</strong> Consider increasing your maximum bid to improve your chances of winning.</p>
</div>
` : ''}
<div style="text-align: center; margin: 30px 0;">
  <a href="${productUrl}" style="display: inline-block; background: linear-gradient(135deg, #72AEC8 0%, #5a9ab8 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
    ${productSold && isWinning ? 'Complete Payment' : 'View Auction'}
  </a>
</div>
    `.trim();

    const html = this.getBaseEmailTemplate(title, headerColor1, headerColor2, content);

    return sendMail({
      to: bidder.email,
      subject: isWinning 
        ? `✅ You're winning: ${productName}` 
        : `📊 Bid placed: ${productName}`,
      html
    });
  }

  static async sendOutbidNotificationToPreviousBidder(previousBidder, productName, newCurrentPrice, previousPrice, wasOutbid, productUrl) {
    const headerColor1 = wasOutbid ? '#dc3545' : '#ffc107';
    const headerColor2 = wasOutbid ? '#c82333' : '#e0a800';
    const title = wasOutbid ? "You've Been Outbid!" : "Price Updated";
    const borderColor = wasOutbid ? '#dc3545' : '#ffc107';
    const buttonColor1 = wasOutbid ? '#28a745' : '#72AEC8';
    const buttonColor2 = wasOutbid ? '#218838' : '#5a9ab8';
    const buttonText = wasOutbid ? 'Place New Bid' : 'View Auction';

    const content = `
<p>Dear <strong>${previousBidder.fullname}</strong>,</p>
${wasOutbid 
  ? `<p>Unfortunately, another bidder has placed a higher bid on the product you were winning:</p>`
  : `<p>Good news! You're still the highest bidder, but the current price has been updated due to a new bid:</p>`
}
<div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid ${borderColor};">
  <h3 style="margin: 0 0 15px 0; color: #333;">${productName}</h3>
  ${!wasOutbid ? `
  <p style="margin: 5px 0; color: #28a745;"><strong>✓ You're still winning!</strong></p>
  ` : ''}
  <p style="margin: 5px 0;"><strong>New Current Price:</strong></p>
  <p style="font-size: 28px; color: ${borderColor}; margin: 5px 0; font-weight: bold;">
    ${new Intl.NumberFormat('en-US').format(newCurrentPrice)} VND
  </p>
  <p style="margin: 10px 0 0 0; color: #666; font-size: 14px;">
    <i>Previous price: ${new Intl.NumberFormat('en-US').format(previousPrice)} VND</i>
  </p>
</div>
${wasOutbid ? `
<div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0;">
  <p style="margin: 0; color: #856404;"><strong>💡 Don't miss out!</strong> Place a new bid to regain the lead.</p>
</div>
` : `
<div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 15px 0;">
  <p style="margin: 0; color: #155724;"><strong>💡 Tip:</strong> Your automatic bidding is working! Consider increasing your max bid if you want more protection.</p>
</div>
`}
<div style="text-align: center; margin: 30px 0;">
  <a href="${productUrl}" style="display: inline-block; background: linear-gradient(135deg, ${buttonColor1} 0%, ${buttonColor2} 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
    ${buttonText}
  </a>
</div>
    `.trim();

    const html = this.getBaseEmailTemplate(title, headerColor1, headerColor2, content);

    return sendMail({
      to: previousBidder.email,
      subject: wasOutbid 
        ? `⚠️ You've been outbid: ${productName}`
        : `📊 Price updated: ${productName}`,
      html
    });
  }

  static async sendSellerReplyNotification(recipient, { productName, sellerName, answer, productUrl }) {
    const content = `
<p>Dear <strong>${recipient.fullname}</strong>,</p>
<p>The seller has responded to a question on a product you're interested in:</p>
<div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #667eea;">
  <p><strong>Product:</strong> ${productName}</p>
  <p><strong>Seller:</strong> ${sellerName}</p>
  <p><strong>Answer:</strong></p>
  <p style="background-color: #f8f9fa; padding: 15px; border-radius: 5px;">${answer}</p>
</div>
<div style="text-align: center; margin: 30px 0;">
  <a href="${productUrl}" style="display: inline-block; background-color: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
    View Product
  </a>
</div>
    `.trim();

    const html = this.getBaseEmailTemplate('Seller Response on Product', '#667eea', '#5a67d8', content);

    return sendMail({
      to: recipient.email,
      subject: `Seller answered a question on: ${productName}`,
      html
    });
  }

  static async sendCommentNotificationToSeller(seller, { productName, commenterName, contentText, productUrl, isReply }) {
    const title = isReply ? 'New Reply on Your Product' : 'New Question About Your Product';
    const subject = isReply
      ? `New reply on your product: ${productName}`
      : `New question about your product: ${productName}`;
    const label = isReply ? 'Reply' : 'Question';
    const buttonText = isReply ? 'View Product & Reply' : 'View Product & Answer';

    const content = `
<div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #667eea;">
  <p><strong>Product:</strong> ${productName}</p>
  <p><strong>From:</strong> ${commenterName}</p>
  <p><strong>${label}:</strong></p>
  <p style="background-color: #f8f9fa; padding: 15px; border-radius: 5px;">${contentText}</p>
</div>
<div style="text-align: center; margin: 30px 0;">
  <a href="${productUrl}" style="display: inline-block; background-color: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
    ${buttonText}
  </a>
</div>
    `.trim();

    const html = this.getBaseEmailTemplate(title, '#667eea', '#5a67d8', content);

    return sendMail({
      to: seller.email,
      subject,
      html
    });
  }

  static async sendBidRejectedNotification(rejectedBidderInfo, { productName, sellerName, homeUrl }) {
    const content = `
<p>Dear <strong>${rejectedBidderInfo.fullname}</strong>,</p>
<p>We regret to inform you that the seller has rejected your bid on the following product:</p>
<div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #dc3545;">
  <h3 style="margin: 0 0 10px 0; color: #333;">${productName}</h3>
  <p style="margin: 5px 0; color: #666;"><strong>Seller:</strong> ${sellerName || 'N/A'}</p>
</div>
<p style="color: #666;">This means you can no longer place bids on this specific product. Your previous bids on this product have been removed.</p>
<p style="color: #666;">You can still participate in other auctions on our platform.</p>
<div style="text-align: center; margin: 30px 0;">
  <a href="${homeUrl}" style="display: inline-block; background: linear-gradient(135deg, #72AEC8 0%, #5a9ab8 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
    Browse Other Auctions
  </a>
</div>
<p style="color: #888; font-size: 13px;">If you believe this was done in error, please contact our support team.</p>
    `.trim();

    const html = this.getBaseEmailTemplate('Bid Rejected', '#dc3545', '#c82333', content);

    return sendMail({
      to: rejectedBidderInfo.email,
      subject: `Your bid has been rejected: ${productName}`,
      html
    });
  }

  static async sendBidNotifications({ seller, currentBidder, previousBidder, productName, newCurrentPrice, previousPrice, bidAmount, newHighestBidderId, userId, previousHighestBidderId, priceChanged, productSold, productUrl }) {
    const emailPromises = [];
    const isWinning = newHighestBidderId === userId;
    const wasOutbid = newHighestBidderId !== previousHighestBidderId;

    // 1. Email to SELLER
    if (seller && seller.email) {
      emailPromises.push(
        this.sendBidNotificationToSeller(seller, productName, currentBidder, newCurrentPrice, previousPrice, productUrl, productSold)
      );
    }

    // 2. Email to CURRENT BIDDER
    if (currentBidder && currentBidder.email) {
      emailPromises.push(
        this.sendBidConfirmationToBidder(currentBidder, productName, bidAmount, newCurrentPrice, isWinning, productUrl, productSold)
      );
    }

    // 3. Email to PREVIOUS HIGHEST BIDDER
    if (previousBidder && previousBidder.email && priceChanged) {
      emailPromises.push(
        this.sendOutbidNotificationToPreviousBidder(previousBidder, productName, newCurrentPrice, previousPrice, wasOutbid, productUrl)
      );
    }

    if (emailPromises.length > 0) {
      await Promise.all(emailPromises);
    }

    return emailPromises.length;
  }
}

export default EmailService;
