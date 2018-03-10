import jwt from 'jsonwebtoken';  
import crypto from 'crypto';
import db from './../models';
import config from '../config/main';
import uuid from 'uuid/v4'; // https://www.npmjs.com/package/uuid
import Twilio from 'twilio';
import { mail as helper } from 'sendgrid';
import SendGrid from 'sendgrid';

const twilio = new Twilio(config.twilio.twilioAccountSid, config.twilio.twilioAuthToken);
const sg  = new SendGrid(process.env.SENDGRID_API_KEY);


const authController = {};


function generateToken(user) {  
	return jwt.sign(user, config.secret, {
		expiresIn: 10080, // in seconds = 2.8 hours
	});
}

function generateRefreshToken() {

	const currentDate = new Date();
	// Refresh token is currently set to expire in 7 days
	currentDate.setTime( currentDate.getTime() + 7 * 86400000 );

	const newRefreshToken = {
		token: uuid(),
		createdAt: Date.now(),
		expiredAt: currentDate,
	};

	return newRefreshToken;
}

function cleanRefreshTokens(refreshTokens) {

	// Remove all but the latest 5 refresh tokens... not sure if this is the best approach
	const totalRefreshTokens = refreshTokens.length;

	if ( totalRefreshTokens > 5 ) {
		refreshTokens.splice(0, totalRefreshTokens-5);
	}

	return refreshTokens;
}

// Set user info from request
function setUserInfo(request) {  
	return {
		_id: request._id,
		_account: request._account,
		profile: {
			firstName: request.profile.firstName,
			middleName: request.profile.middleName,
			lastName: request.profile.lastName,
			photo: request.profile.photo,
		},	
		email: request.email,
		role: request.role,
		settings: {
			timeZone: request.settings.timeZone,
			mobilePhone: request.settings.mobilePhone,
		},
	};
}


//========================================
// Login Route
//========================================
authController.login = async (req, res, next) => {
	// passportjs hijacks this request and authenticates the user first
	const newRefreshToken = generateRefreshToken();

	try {

		let user = await db.User.findOneAndUpdate({ 
			_id: req.user._id, 
			_account: req.user._account._id,
			isDeleted: false,
			isVerified: true,
		}, { 
			$push: { "refreshTokens": newRefreshToken },
		}, {
			new: true,
		});

		// Clean refresh token array
		user.refreshTokens = cleanRefreshTokens(user.refreshTokens);
		db.User.findOneAndUpdate({
			_id: user._id,
			_account: req.user._account._id,
  			isDeleted: false,
		}, {
			$set: {
		  		"refreshTokens": user.refreshTokens,
			},
		}).exec();

		const userInfo = setUserInfo(user);

		res.status(200).json({
			token: 'JWT ' + generateToken(userInfo),
			refreshToken: newRefreshToken.token,
			user: userInfo,
		});

	} catch (err) {

		console.log('Error occurred for User logging in: ', err);
		next(err);

	}

}


authController.refreshToken = async (req, res, next) => {
	req.assert('email', 'Invalid email address').notEmpty().isEmail();
	req.assert('refreshToken', 'Invalid refresh token').notEmpty();

	req.sanitize('email').normalizeEmail({ remove_dots: false });

	const errors = req.validationErrors();

	if (errors) {
		next(errors);
	}

	const { email, refreshToken } = req.body;

	try {

		// Check database for valid refreshToken
		let user = await db.User.findOne({ email: email }, { password: 0 } );

		for(let i = 0; i < user.refreshTokens.length; i++) {

			// Ensure refreshToken is valid and not expired
			if ( user.refreshTokens[i].token == refreshToken && user.refreshTokens[i].expiredAt > Date.now() ) {
				// Clean up the expired refresh tokens before they get out of hand
				const updatedRefreshTokens = user.refreshTokens.filter( refreshToken => {
				    return refreshToken.expiredAt > Date.now();
				});
				// Renew the access and refresh tokens
				const newRefreshToken = generateRefreshToken();

				user.refreshTokens = updatedRefreshTokens;
				user.refreshTokens.push(newRefreshToken);

				let updatedUser = await user.save();

				const userInfo = setUserInfo(updatedUser);

				res.status(200).json({
					token: 'JWT ' + generateToken(userInfo),
					refreshToken: newRefreshToken.token,
					user: userInfo,
				});

			}
			if ( i === user.refreshTokens.length ) {
				// refreshToken is not valid or is expired
				return res.status(422).send({ error: 'The refresh token is not valid.' });
			}
		}

	} catch (err) {

		console.log('Error occurred validating refresh token: ', err);
		next(err);

	}		

}


//========================================
// Registration Route
//========================================
authController.registerStep1 = async (req, res, next) => {  
	req.assert('email', 'Email is not valid').isEmail();
  	req.assert('password', 'Password must be at least 6 characters').len(6);
  	req.sanitize('email').normalizeEmail({ remove_dots: false });

  	// TODO: Receive "best guess" timezone from request

  	const errors = req.validationErrors();

	if (errors) {
		// TODO: Remove Errors from the response and replace with text response
		return res.status(401).json({ error: { msg: errors } });
	}

	// Check for registration errors
	const { email, password } = req.body;


	try {

		// Create a new account for this user
		const newAccount = new db.Account({
			name: uuid(),
			description: '',
		});

		let account = await newAccount.save();

		let existingUser = await db.User.findOne({ 
			email: email,
			isDeleted: false,
		});

		// If user is not unique, return error
	  	if (existingUser) {
	    	return res.status(422).send({ error: 'That email address is already in use.' });
	  	}
		
		// Register code will be received and returned to User for each step in registration process
		const registerCode = uuid();

	  	// If email is unique and password was provided, create account
	  	const user = new db.User({
	  		_account: account._id,
	    	email: email,
	    	password: password,
	    	role: 'Owner',
	    	registerCode: registerCode, // <-- Generate a Registration Verification Code. 
	  	});

	  	let newUser = await user.save();

		// Subscribe member to Mailchimp list
		// mailchimp.subscribeToNewsletter(user.email);

		// Update the Account with the _creator value which is the same as the registering user in this case
		db.Account.update({ _id: account._id }, { $set: { _creator: newUser._id }}).exec();

		res.status(200).json({
	  		registerCode: registerCode,
		});

	} catch (err) {

		// Delete the account since the user was not created
  		db.Account.findOneAndRemove({_id: account._id}).exec();
		console.log('Error occurred in Registration step 1: ', err);
		next(err);

	}

}

authController.forgotPassword = (req, res, next) => {
	req.assert('email', 'Please enter a valid email address.').isEmail();
	req.assert('sendMethod', 'Please select a method to receive notification (email or text).').notEmpty().matches({ options: ['email', 'text'] });

	req.sanitize('email').normalizeEmail({ remove_dots: false });

	const errors = req.validationErrors();

	if (errors) {
		next(errors);
	}

	async.waterfall([
		function createRandomToken(done) {
			if ( sendMethod === 'text'
					&& ( typeof( user.settings.mobilePhone ) !== 'undefined' && typeof( user.settings.mobilePhone.phoneNumber ) !== 'undefined' ) ) {
				crypto.randomBytes(7, (err, buf) => {
			    	const token = buf.toString('hex');
			    	done(err, token);
			  	});
			} else {
				// Longer verification codes when sending to user via email
			  	crypto.randomBytes(16, (err, buf) => {
			    	const token = buf.toString('hex');
			    	done(err, token);
			  	});
			}
		},
		function setRandomToken(token, done) {
	  		db.User.findOne({ email: req.body.email }, (err, user) => {
	    		if (err) { return done(err); }
	    		if (!user) {
	      			return res.status(401).json({ error: { msg: 'No account with that email address exists.' } });
	    		}
	    		user.passwordResetToken = token;
	    		user.passwordResetExpires = Date.now() + 3600000; // 1 hour
	    		user.save( err => {
	      			done(err, token, user);
	    		});
	  		});
		},
		function sendForgotPasswordToken(token, user, done) {

			if ( sendMethod === 'text'
					&& ( typeof( user.settings.mobilePhone ) !== 'undefined' && typeof( user.settings.mobilePhone.phoneNumber ) !== 'undefined' ) ) {

			    // Create options to send the message
	            const options = {
	                //to: `+ ${user.settings.mobilePhone}`,
	                to: `${user.settings.mobilePhone.phoneNumber}`,
	                from: config.twilio.twilioPhoneNumber,
	                /* eslint-disable max-len */
	                body: `Your verification code: ${token}.`,
	                /* eslint-enable max-len */
	            };

	            //console.log('options for Twilio: ', options);

			    // Send the message!
	            twilio.messages.create(options, function(err, response) {
	            	// Log the last few digits of a phone number
	                let masked = user.settings.mobilePhone.phoneNumber.substr(0,
	                    user.settings.mobilePhone.phoneNumber.length - 5);
	                    
	                masked += '*****';

	                if (err) {
	                    // Just log it for now
	                    console.log(`SOURCE: Forgot Password. ERROR sending text message for accountId (${user._account}), userId (${user._id}), phone (${masked}): `, err);
	                	res.status(500).json({
					        message: err.toString(),
					    });
					    done(err);
	                } else {
						//console.log('Response from Twilio: ', response);
						//console.log('user mobilePhone: ', user.settings.mobilePhone.phoneNumber);
	                    console.log(`Message sent to ${masked}`);
	                    console.log(`SOURCE: Forgot Password. Text message request sent successfully to Twilio for accountId (${user._account}), userId (${user._id}), phone (${masked}).`);
	                	res.status(200).json({
					      	success: true,
					      	msg: `A text message has been sent to ${masked} with further instructions.`,
					    });
	                }
	            });

			}

			// Send verification token by email if selected or if user's mobile phone number does not exist
			if (sendMethod === 'email' 
					|| ( typeof( user.settings.mobilePhone ) !== 'undefined' || typeof( user.settings.mobilePhone.phoneNumber ) !== 'undefined' ) ) {
			  	const fromEmail = new helper.Email(config.ap_support_email);
				const toEmail = new helper.Email(user.email);
				const subject = 'Reset your password';
				const content = new helper.Content('text/plain', `You are receiving this email because you (or someone else) have requested the reset of the password for your account.\n\n
			      		Please click on the following link, or paste this into your browser to complete the process:\n\n
			      		http://${req.headers.host}/reset/${token}\n\n
			      		If you did not request this, please ignore this email and your password will remain unchanged.\n`);
				const mail = new helper.Mail(fromEmail, subject, toEmail, content);

				const request = sg.emptyRequest({
				  	method: 'POST',
				  	path: '/v3/mail/send',
				  	body: mail.toJSON()
				});

				sg.API(request).then( response => {
				    console.log(response.statusCode);
				    console.log(response.body);
				    console.log(response.headers);

				    res.status(200).json({
				      	success: true,
				      	msg: `An e-mail has been sent to ${user.email} with further instructions.`,
				    });
				}).catch( err => {
				    // error is an instance of SendGridError
				    // The full response is attached to error.response
				    console.log(err.response.statusCode);
					res.status(500).json({
				        message: err.toString(),
				    });
				    done(err);
				});
			}

		}
	], err => {
		res.status(401).json({ error: 'An error occurred while trying to process your forgot password request. Please try again.' });
		if (err) { return next(err); }
	});

}

authController.validatePasswordResetToken = async (req, res, next) => {
	req.assert('code', 'Verification code is not valid').notEmpty();

	const errors = req.validationErrors();

	if (errors) {
		// TODO: Remove Errors from the response and replace with text response
		return res.status(401).json({ error: { msg: errors } });
  	}

  	// Get the verfication from the url or body depending on the sendMethod (email or text)
  	const { code } = ( typeof req.params.code !== 'undefined' ) ? req.params : req.body;

  	try {

		let user = await db.User.findOne({ 
			resetPasswordToken: token, 
			resetPasswordExpires: { $gt: Date.now() },
		});
	    if (!user) {
	      return res.status(401).json({ error: { msg: 'Password reset token is invalid or has expired.' } });
	    }
	    res.status(200).json({
	        success: true,
	        code: code,
			msg: 'Success! Password verification code has been verified',
	    });

    } catch (err) {

		console.log('Error occurred validating password reset token: ', err);
		next(err);

	}

}

authController.resetPassword = (req, res, next) => {
	req.assert('password', 'Password must be at least 4 characters long.').len(4);
	req.assert('confirm', 'Passwords must match.').equals(req.body.password);
	req.assert('code', 'Verification code is not valid').notEmpty();

	const errors = req.validationErrors();

	if (errors) {
		// TODO: Remove Errors from the response and replace with text response
		return res.status(401).json({ error: { msg: errors } });
	}

	const { code } = req.params;
	const { password } = req.body;

	async.waterfall([
		function resetPassword(done) {
	  		db.User.findOne({ 
	  			passwordResetToken: code,
	  			passwordResetExpires: { $gt: Date.now() },
	  		}).then( user => {
	  			if (!user) {
			      	return res.status(401).json({ error: { msg: 'Password reset code is invalid or has expired.' } });
			    }

			    user.password = password;
				user.passwordResetToken = undefined;
				user.passwordResetExpires = undefined;

			    user.save().then( updatedUser => {

					const userInfo = setUserInfo(updatedUser);

					res.status(200).json({
						token: 'JWT ' + generateToken(userInfo),
						user: userInfo
					});
					done(null, updatedUser);
				}).catch( err => {
					return next(err);
				});
	  		}).catch( err => {
	  			return next(err);
	  		});
		},
		function sendResetPasswordEmail(user, done) {
	  		const fromEmail = new helper.Email(config.ap_support_email);
			const toEmail = new helper.Email(user.email);
			const subject = 'Your password has been changed';
			const content = new helper.Content('text/plain', `Hello ${user.profile.firstName},\n\nThis is a confirmation that the password for your account ${user.email} has just been changed.\n`);
			const mail = new helper.Mail(fromEmail, subject, toEmail, content);

			const request = sg.emptyRequest({
			  	method: 'POST',
			  	path: '/v3/mail/send',
			  	body: mail.toJSON()
			});

			sg.API(request).then( response => {
			    console.log(response.statusCode);
			    console.log(response.body);
			    console.log(response.headers);

			    res.status(200).json({
			      	success: true,
			      	msg: `Success! Password has been changed for user with email: ${user.email}`,
			    });
			    done(null);
			}).catch( err => {
			    // error is an instance of SendGridError
			    // The full response is attached to error.response
			    console.log(err.response.statusCode);
				res.status(500).json({
			        message: err.toString(),
			    });
			    done(err);
			});

		}
	], err => {
		res.status(401).json({ error: 'An error occurred while trying to reset your password. Please try again.' });
		if (err) { return next(err); }
	});

}

//========================================
// Authorization Middleware
//========================================

// Role authorization check
authController.roleAuthorization = role => {  
  	return function(req, res, next) {
    	const user = req.user;

    	db.User.findOne({ _id: user._id}).then( foundUser => {
    		// Inspired by -> https://blog.nodeswat.com/implement-access-control-in-node-js-8567e7b484d1
    		// To add read, write, delete permissioning add a second attribute called "can", then implement it
    		// e.g. owner : { inherits: ['member'], can: ['read', 'write'] }
    		const rolesObj = {
				member: { inherits: []}, 
				owner: { inherits: ['member'] }, 
				admin: { inherits: ['member', 'owner'] }, 
				superadmin: { inherits: ['member', 'owner', 'admin'] },
			};

    		// If user is found, check role.
    		if ( rolesObj[role.toLowerCase()] === undefined ) {
    			res.status(401).json({ error: 'You are not authorized to access this content.' });
      			return next('Unauthorized');
    		}
    		let $role = rolesObj[foundUser.role.toLowerCase()];

    		//console.log('foundUser.role.toLowerCase(): ', foundUser.role.toLowerCase());
    		//console.log('role.toLowerCase(): ', role.toLowerCase());
    		//console.log('$role.inherits.indexOf(foundUser.role.toLowerCase()): ', $role.inherits.indexOf(role.toLowerCase()));

    		// Find the role in rolesObj from user's role
    		// Find role passed in within rolesObj role of user within inherits array

    		// User roles inherit roles lower than theirs
		    if (foundUser.role.toLowerCase() === role.toLowerCase() || $role.inherits.indexOf(role.toLowerCase()) > -1) {
		    	return next();
		    }

      		/*if (foundUser.role == role) {
        		return next();
      		}*/

      		res.status(401).json({ error: 'You are not authorized to access this content.' });
      		return next('Unauthorized');
    	}).catch( err => {
    		res.status(422).json({ error: 'No user was found.' });
        	return next(err);
    	});

  	}
}


export default authController;