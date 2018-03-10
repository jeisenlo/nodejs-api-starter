import express from 'express';
import passportService from './config/passport';
import passport from 'passport';

// Controller Imports
import accountController from './controllers/accountController';
import authController from './controllers/authController';
import userController from './controllers/userController';


// Middleware to require login/auth
const requireAuth = passport.authenticate('jwt', { session: false });  
const requireLogin = passport.authenticate('local', { session: false }); 

// Constants for role types
const REQUIRE_SUPERADMIN = "SuperAdmin",
	  REQUIRE_ADMIN = "Admin",  
      REQUIRE_OWNER = "Owner",
      REQUIRE_MEMBER = "Member";



const routes = express();

// Main route
routes.get('/', function(req, res) {
	return res.status(200).json({message: 'Welcome to the API starter using NodeJS, Express, MondoDB and Mongoose!'});
});


// Auth Routes
routes.post('/registration', authController.registerStep1);
routes.post('/auth/forgotpassword', authController.forgotPassword);
routes.post('/auth/login', requireLogin, authController.login);
routes.post('/auth/resetpassword', authController.resetPassword);
routes.post('/auth/token', authController.refreshToken);


// User Routes
routes.get('/users', requireAuth, authController.roleAuthorization(REQUIRE_ADMIN), userController.getByAccountId);
routes.post('/users', requireAuth, authController.roleAuthorization(REQUIRE_ADMIN), userController.create);
routes.get('/users/:id', requireAuth, userController.getById);
routes.put('/users/:id', requireAuth, userController.updateById);
routes.delete('/users/:id', requireAuth, authController.roleAuthorization(REQUIRE_ADMIN), userController.deleteById);
routes.get('/users/:id/settings', requireAuth, userController.getSettings);
routes.put('/users/:id/settings', requireAuth, userController.updateSettings);


// Account Routes
routes.get('/accounts', requireAuth, authController.roleAuthorization(REQUIRE_SUPERADMIN), accountController.getAll);
routes.get('/accounts/:id', requireAuth, accountController.getById);


// API Routes
//routes.get('/facebook', requireAuth, apiController.getFacebook);
//routes.get('/twitter', requireAuth, apiController.getTwitter);
//routes.post('/twitter', requireAuth, apiController.postTwitter);
//routes.get('/stripe', requireAuth, apiController.postStripe);
//routes.get('/twilio', requireAuth, apiController.postTwilio);


export default routes;