// npm install nodemailer

// EMAIL_HOST=smtp.gmail.com
// EMAIL_PORT=587
// EMAIL_USER=your-email@gmail.com
// EMAIL_PASS=your-app-password



// // utils/email.js
// const nodemailer = require('nodemailer');

// const sendEmail = async (options) => {
//   const transporter = nodemailer.createTransport({
//     host: process.env.EMAIL_HOST,
//     port: process.env.EMAIL_PORT,
//     auth: {
//       user: process.env.EMAIL_USER,
//       pass: process.env.EMAIL_PASS,
//     },
//   });

//   const mailOptions = {
//     from: 'PlaniT <noreply@plannit.com>',
//     to: options.email,
//     subject: options.subject,
//     text: options.message,
//     html: options.html, // optional HTML version
//   };

//   await transporter.sendMail(mailOptions);
// };

// module.exports = sendEmail;


// // utils/email.js
// const nodemailer = require('nodemailer');

// const sendEmail = async (options) => {
//   const transporter = nodemailer.createTransport({
//     host: process.env.EMAIL_HOST,
//     port: process.env.EMAIL_PORT,
//     auth: {
//       user: process.env.EMAIL_USER,
//       pass: process.env.EMAIL_PASS,
//     },
//   });

//   const mailOptions = {
//     from: 'PlaniT <noreply@plannit.com>',
//     to: options.email,
//     subject: options.subject,
//     text: options.message,
//     html: options.html, // optional HTML version
//   };

//   await transporter.sendMail(mailOptions);
// };

// module.exports = sendEmail;


// const sendEmail = require('../utils/email');

// exports.forgotPassword = async (req, res) => {
//   try {
//     const user = await User.findOne({ email: req.body.email });
    
//     if (!user) {
//       return res.status(404).json({
//         status: "error",
//         message: "There is no user with that email address",
//       });
//     }

//     const resetToken = user.createPasswordResetToken();
//     await user.save({ validateBeforeSave: false });

//     // Create reset URL
//     const resetURL = `http://localhost:3000/reset-password/${resetToken}`;
    
//     // Email message
//     const message = `Forgot your password? Submit a PATCH request with your new password to: ${resetURL}\nIf you didn't forget your password, please ignore this email!`;

//     try {
//       await sendEmail({
//         email: user.email,
//         subject: 'Your password reset token (valid for 10 min)',
//         message,
//       });

//       res.status(200).json({
//         status: "success",
//         message: "Token sent to email!",
//       });
      
//     } catch (emailErr) {
//       // If email fails, clear the reset token
//       user.passwordResetToken = undefined;
//       user.passwordResetExpires = undefined;
//       await user.save({ validateBeforeSave: false });

//       return res.status(500).json({
//         status: "error",
//         message: "There was an error sending the email. Try again later!",
//       });
//     }
    
//   } catch (err) {
//     // ... error handling
//   }
// };