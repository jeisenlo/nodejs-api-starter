import mongoose from 'mongoose';
import Twilio from 'twilio';
import config from './../config/main';
import db from './../models';
import boom from 'boom';

// TODO: Update to ES6 syntax
var helper = require('sendgrid').mail;
var sg  = require('sendgrid')(process.env.SENDGRID_API_KEY);


const userController = {};

userController.getByAccountId = async (req, res, next) => {
  req.assert('skip').optional().isInt({ min: 0 });
  req.assert('limit').optional().isInt({ min: 1, max: config.max_records });

  const { skip, limit } = req.query;
  const recordSkip = parseInt(skip || 0, 10);
  const recordLimit = parseInt(limit || config.max_records, 10);

  try {

    // Currently locked down to current user's account
    let users = await db.User.find({ 
      _account: req.user._account._id,
      isDeleted: false,
    }).skip(recordSkip).limit(recordLimit);

    res.status(200).json({
      data: users,
    });

  } catch (err) {

    console.log('Error getting Users by AccountId: ', err);
    return next(boom.badImplementation('Error getting Users by AccountId', err));

  }

}

userController.getById = async (req, res, next) => {

  try {
  // Currently locked down to current user

    let existingUser = await db.User.findOne({ 
      _id: req.user._id, 
      _account: req.user._account._id,
      isDeleted: false,
    }, { password: 0, refreshTokens: 0 }).populate({
      path: '_account',
      select: 'name createdAt',
      match: { 'isDeleted': false },
    });

    res.status(200).json({
      data: existingUser,
    });

  } catch (err) {

    console.log('Error getting User by Id: ', err);
    return next(boom.badImplementation('Error getting User by Id', err));

  }

}

// Currently, only users with a role of Member or Owner can be created using this method
userController.create = async (req, res, next) => {
  req.assert('email', 'Email is not valid').notEmpty().isEmail();
  req.assert('role', 'Invalid role').notEmpty().matches({ options: ['Member', 'Owner'] });
  req.assert('firstName', 'First Name is required').notEmpty().len(2, 50);
  req.assert('lastName', 'Last Name is required').notEmpty().len(2, 50);
  
  req.sanitize('email').normalizeEmail({ remove_dots: false });

  const errors = req.validationErrors();

  if (errors) {
    return next(boom.badRequest('Invalid or missing parameters', errors));
  }

  const { email, role, firstName, middleName, lastName } = req.body;

  try {

    const user = new db.User({
      _account: req.user._account._id,
      _creator: req.user._id,
      email,
      role,
      settings: {
        _school: req.user.settings._school._id,
        _gradeLevel: gradeLevelId,
        timeZone: req.user.settings.timeZone,
        learningStandardType: req.user.settings.learningStandardType,
      },
      profile: {
        firstName,
        middleName,
        lastName,
        photo,
      },
      refreshTokens: [],
    });

    let newUser = await user.save();

    // Send the new user an email with invite to site and who sent the invite. 
    // The new user must create a password when they first log in
    var fromEmail = new helper.Email(config.ap_support_email);
    var toEmail = new helper.Email(newUser.email);
    var subject = `${req.user.profile.firstName} has invited you to Angular Pulse`;
    var content = new helper.Content('text/plain', `Hello ${newUser.profile.firstName},\n\n${req.user.profile.firstName} has sent you an invitation to Angular Pulse.\n`);
    var mail = new helper.Mail(fromEmail, subject, toEmail, content);

    var request = sg.emptyRequest({
        method: 'POST',
        path: '/v3/mail/send',
        body: mail.toJSON()
    });

    let response = await sg.API(request);
    console.log(response.statusCode);
    console.log(response.body);
    console.log(response.headers);

    res.status(200).json({
      data: { success: true, msg: `Success! Invitation has been sent to ${newUser.profile.firstName}.` },
    });

  } catch (err) {

    console.log('Error creating User: ', err);
    return next(boom.badImplementation('Error creating User', err));

  }

}

userController.updateById = async (req, res, next) => {
  req.assert('id', 'Invalid user ID').notEmpty();
  req.assert('firstName', 'First Name must be at least 2 characters').len(2, 50);
  req.assert('lastName', 'Last Name must be at least 2 characters').len(2, 50);
  req.assert('middleName', 'Middle Name must be at least 1 characters').optional().len(1, 50);
  req.assert('photo', 'Invalid photo').optional().len(1,75);
  req.assert('email', 'Email is not valid').isEmail();
  req.assert('timeZone', 'Time zone is required').notEmpty();
  //req.assert('role', 'Invalid role').notEmpty().matches({ options: ['Member', 'Owner'] }); // <--- Need to check user role for this field
  //req.assert('mobilePhone', 'Invalid phone').optional().isMobilePhone('any');

  req.sanitize('firstName').escape();
  req.sanitize('lastName').escape();
  req.sanitize('middleName').escape();
  req.sanitize('email').normalizeEmail({ remove_dots: false });

  const errors = req.validationErrors();

  if (errors) {
    return next(boom.badRequest('Invalid or missing parameters', errors));
  }

  const { id } = req.params;
  const { firstName, lastName, middleName, photo, email, gradeLevelId, timeZone, mobilePhone } = req.body;

  try {

    let updatedUser = await db.User.findOneAndUpdate({ 
      _id: id, 
      _account: req.user._account._id,
    }, { 
      $set: {
        "profile": {
          "firstName": firstName,
          "lastName": lastName,
          "middleName": middleName,
          "photo": photo,
        },
        "email": email,
        "settings.timeZone": timeZone,
        "settings.mobilePhone.phoneNumber": mobilePhone,
      },
    }, {
      new: true,
    });

    // Make call to Twilio
    const twilio = new Twilio(config.twilio.twilioAccountSid, config.twilio.twilioAuthToken);
    // https://www.twilio.com/lookup
    // https://www.twilio.com/docs/api/lookups
    let number = await twilio.lookups.v1
      .phoneNumbers(updatedUser.settings.mobilePhone.phoneNumber)
      .fetch();

    if (number.status >= 400) {
      console.log('Response from Twilio not successful: ', number);
      // You **must** do `new Error()`. `next('something went wrong')` will **not** work
      const err = new Error("Bad response from Twilio");
      return next(boom.badRequest('Bad response from Twilio', err));
    }

    updatedUser.settings.mobilePhone = {};
    updatedUser.settings.mobilePhone.countryCode = number.countryCode;
    updatedUser.settings.mobilePhone.phoneNumber = number.phoneNumber;
    updatedUser.settings.mobilePhone.nationalFormat = number.nationalFormat;

    let result = await updatedUser.save();

    console.log('result from updating user with twilio phone result: ', result);

    res.status(200).json({
        data: updatedUser,
    });

  } catch (err) {

    console.log('Error updating User by Id: ', err);
    return next(boom.badImplementation('Error updating User by Id', err));

  }

}

// Performs a soft delete on the user
userController.deleteById = async (req, res, next) => {
  req.assert('id', 'Invalid user ID').notEmpty();

  const errors = req.validationErrors();

  if (errors) {
    return next(boom.badRequest('Invalid or missing User Id', errors));
  }

  const { id } = req.params;

  try {

    let user = await db.User.findOneAndUpdate({
      _id: id,
      _account: req.user._account._id,
    }, {
      $set: {
        "isDeleted": true,
      },
    }, {
      new: true,
    });

    res.status(200).json({
        data: user,
    });

  } catch (err) {

    console.log('Error deleting User by Id: ', err);
    return next(boom.badImplementation('Error deleting User by Id', err));

  }

}

// Get the user's settings
userController.getSettings = async (req, res, next) => {
  req.assert('id', 'Invalid user ID').notEmpty();

  const errors = req.validationErrors();

  if (errors) {
    return next(boom.badRequest('Invalid or missing User Id', errors));
  }

  const { id } = req.params;

  try {

    // Currently only available for the logged in user until we figure out permissions
    let user = await db.User.findOne({
      _id: req.user._id, 
      _account: req.user._account._id,
      isDeleted: false,
    }).lean();
    // return only the settings object and user email
    user.settings.email = user.email;
    
    res.status(200).json({
        data: user.settings,
    });

  } catch (err) {

    console.log('Error getting User Settings by Id: ', err);
    return next(boom.badImplementation('Error getting User Settings by Id', err));

  }

}

userController.updateSettings = async (req, res, next) => {
  req.assert('id', 'Invalid user ID').notEmpty();
  req.assert('timeZone', 'Invalid time zone').notEmpty();
  req.assert('mobilePhone', 'Invalid mobile phone').notEmpty();

  const errors = req.validationErrors();

  if (errors) {
    return next(boom.badRequest('Invalid or missing parameters', errors));
  }

  const { id } = req.params;
  const { timeZone, mobilePhone } = req.body;

  try {

    let updatedUser = await db.User.findOneAndUpdate({
      _id: id,
      _account: req.user._account._id,
    }, {
      $set: {
        "settings.timeZone": timeZone,
        "settings.mobilePhone.phoneNumber": mobilePhone,
      },
    }, {
      new: true,
    });

    // Make call to Twilio
    const twilio = new Twilio(config.twilio.twilioAccountSid, config.twilio.twilioAuthToken);
    // https://www.twilio.com/lookup
    // https://www.twilio.com/docs/api/lookups
    let number = await twilio.lookups.v1
      .phoneNumbers(updatedUser.settings.mobilePhone.phoneNumber)
      .fetch();

    if (number.status >= 400) {
      console.log('Response from Twilio not successful: ', number);
      // You **must** do `new Error()`. `next('something went wrong')` will **not** work
      const err = new Error("Bad response from Twilio");
      return next(boom.badRequest('Bad response from Twilio', err));
    }

    updatedUser.settings.mobilePhone = {};
    updatedUser.settings.mobilePhone.countryCode = number.countryCode;
    updatedUser.settings.mobilePhone.phoneNumber = number.phoneNumber;
    updatedUser.settings.mobilePhone.nationalFormat = number.nationalFormat;

    let result = await updatedUser.save();

    console.log('result from updating user settings with twilio phone result: ', result);

    res.status(200).json({
        data: updatedUser.settings,
    });
  
  } catch (err) {

    console.log('Error updating User Settings by Id: ', err);
    return next(boom.badImplementation('Error updating User Settings', err));

  }

}


export default userController;