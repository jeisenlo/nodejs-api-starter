// Importing Passport, strategies, and config
import passport from 'passport';  
import User from '../models/User';
import config from './main';
import { Strategy as JWTStrategy, ExtractJwt } from 'passport-jwt';
import LocalStrategy from 'passport-local';
//import { Strategy as FacebookStrategy } from 'passport-facebook';

const localOptions = { usernameField: 'email' };  

// Setting up local login strategy for the login page
const localLogin = new LocalStrategy(localOptions, function(email, password, done) {  
  User.findOne({ 
    email: email,
    isDeleted: false,
  }).populate({
    path: '_account',
    select: 'name',
  }).populate({
    path: 'settings._school',
    select: 'school',
  }).populate({
    path: 'settings._gradeLevel',
    select: 'gradeLevel',
  }).then( user => {
//console.log('user in passport.js: ', user);

    if(!user) { 
      return done(null, false, { error: "Sorry, we couldn't find an account with that email address." }); 
    }

    if(!user.isVerified) { 
      return done(null, false, { error: "Sorry, this account has not been verified." }); 
    }

    // Insprired by: http://devsmash.com/blog/implementing-max-login-attempts-with-mongoose
    // check if the account is currently locked
    if (user.isLocked) {
      // just increment login attempts if account is already locked
      return user.incLoginAttempts(function(err) {
          if (err) return done(err);
          return done(null, false, { error: "Sorry, you have reached the maximum number of login attempts." }); 
      });
    }

    user.comparePassword(password, function(err, isMatch) {
      if (err) { return done(err); }

      if (!isMatch) { 
        // password is incorrect, so increment login attempts before responding
        user.incLoginAttempts( err => {
            if (err) return done(err);

            return done(null, false, { error: "Sorry, that password isn't right." }); 
        });

      } else {
        // Password matched, so log user in
        // if there's no lock or failed attempts, just return the user
        if (!user.loginAttempts && !user.lockUntil) return done(null, user);

        // reset attempts and lock info
        var updates = {
          $set: { loginAttempts: 0 },
          $unset: { lockUntil: 1 },
        };
        return user.update(updates, err => {
          if (err) return done(err);
          return done(null, user);
        });

      }

    });
    
  }).catch( err => {
    if(err) { return done(err); }
  });

});

const jwtOptions = {  
  // Telling Passport to check authorization headers for JWT
  //jwtFromRequest: ExtractJwt.fromAuthHeader(),
  jwtFromRequest: ExtractJwt.fromAuthHeaderWithScheme("jwt"),
  // Telling Passport where to find the secret
  secretOrKey: config.secret
};

// Setting up JWT login strategy for all requests after the localLogin
const jwtLogin = new JWTStrategy(jwtOptions, function(payload, done) {

  User.findById( payload._id ).populate({
    path: '_account',
    select: 'name',
  }).populate({
    path: 'settings._school',
    select: 'school',
  }).populate({
    path: 'settings._gradeLevel',
    select: 'gradeLevel',
  }).then( user => {
    if (user) {
      done(null, user);
    } else {
      done(null, false);
    }
  }).catch( err => {
    if (err) { return done(err, false); }
  });

});

/**
 * Sign in with Facebook.
 */
/*const facebookLogin = new FacebookStrategy({
  clientID: process.env.FACEBOOK_ID,
  clientSecret: process.env.FACEBOOK_SECRET,
  callbackURL: '/auth/facebook/callback',
  profileFields: ['name', 'email', 'link', 'locale', 'timezone'],
  passReqToCallback: true
}, (req, accessToken, refreshToken, profile, done) => {
  if (req.user) {
    User.findOne({ facebook: profile.id }, (err, existingUser) => {
      if (err) { return done(err); }
      if (existingUser) {
        req.flash('errors', { msg: 'There is already a Facebook account that belongs to you. Sign in with that account or delete it, then link it with your current account.' });
        done(err);
      } else {
        User.findById(req.user.id, (err, user) => {
          if (err) { return done(err); }
          user.facebook = profile.id;
          user.tokens.push({ kind: 'facebook', accessToken });
          user.profile.name = user.profile.name || `${profile.name.givenName} ${profile.name.familyName}`;
          user.profile.gender = user.profile.gender || profile._json.gender;
          user.profile.picture = user.profile.picture || `https://graph.facebook.com/${profile.id}/picture?type=large`;
          user.save((err) => {
            req.flash('info', { msg: 'Facebook account has been linked.' });
            done(err, user);
          });
        });
      }
    });
  } else {
    User.findOne({ facebook: profile.id }, (err, existingUser) => {
      if (err) { return done(err); }
      if (existingUser) {
        return done(null, existingUser);
      }
      User.findOne({ email: profile._json.email }, (err, existingEmailUser) => {
        if (err) { return done(err); }
        if (existingEmailUser) {
          req.flash('errors', { msg: 'There is already an account using this email address. Sign in to that account and link it with Facebook manually from Account Settings.' });
          done(err);
        } else {
          const user = new User();
          user.email = profile._json.email;
          user.facebook = profile.id;
          user.tokens.push({ kind: 'facebook', accessToken });
          user.profile.name = `${profile.name.givenName} ${profile.name.familyName}`;
          user.profile.gender = profile._json.gender;
          user.profile.picture = `https://graph.facebook.com/${profile.id}/picture?type=large`;
          user.profile.location = (profile._json.location) ? profile._json.location.name : '';
          user.save((err) => {
            done(err, user);
          });
        }
      });
    });
  }
});*/


// Set these strategies up to be used by passportjs
passport.use(jwtLogin);  
passport.use(localLogin); 
//passport.use(facebookLogin);