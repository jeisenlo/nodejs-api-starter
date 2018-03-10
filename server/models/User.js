import mongoose from 'mongoose';
import bcrypt from 'bcrypt-nodejs';


const { Schema } = mongoose;
// max of 5 attempts, resulting in a 2 hour lock
const MAX_LOGIN_ATTEMPTS = 10;
const LOCK_TIME = 2 * 60 * 60 * 1000; // <- 2 hour lock time

// select: false <- to never return the field on a request... doesn't work well on the password field. See below.

const UserSchema = new Schema({  
  _account: { 
    type: Schema.ObjectId, 
    ref: 'Account', 
    required: true, 
  },
  _creator: {
    type: Schema.ObjectId,
    ref: 'User',
    required: false,
  },
  email: {
    type: String,
    lowercase: true,
    unique: true,
    required: true,
    maxlength: 100,
  },
  password: {
    type: String,
    minlength: [6, 'Password must be 6 characters or more.'],
    maxlength: [100, 'Password must be 30 characters or less.'],
  },
  profile: {
    firstName: { type: String, maxlength: 100 },
    middleName: { type: String, maxlenght: 100 },
    lastName: { type: String, maxlength: 100 },
    photo: { type: String },
  },
  role: {
    type: String,
    enum: ['Member', 'Owner', 'Admin', 'SuperAdmin'],
    default: 'Member',
  },
  settings: {
    timeZone: {
      type: String,
      default: 'America/Chicago',
    },
    mobilePhone: {
      countryCode: {
          type: String,
      },
      phoneNumber: {
        type: String,
      },
      nationalFormat: {
        type: String,
      },
    },
  },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  isDeleted: { 
    type: Boolean, 
    default: false,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  loginAttempts: { 
    type: Number, 
    required: true, 
    default: 0 
  },
  lockUntil: { type: Number },
  refreshTokens: [
    { 
      token: String,
      createdAt: Date,
      expiredAt: Date,
    },
  ],
  registerCode: { type: String },
},
{
  timestamps: true,
});

// Pre-save of user to database, hash password if password is modified or new
UserSchema.pre('save', function(next) {  
  const user = this,
        SALT_FACTOR = 10;

  if (!user.isModified('password')) return next();

  bcrypt.genSalt(SALT_FACTOR, function(err, salt) {
    if (err) return next(err);

    bcrypt.hash(user.password, salt, null, function(err, hash) {
      if (err) return next(err);
      user.password = hash;
      next();
    });
  });
});

// Method to compare password for login
UserSchema.methods.comparePassword = function(candidatePassword, cb) {  
  bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
    if (err) { return cb(err); }

    cb(null, isMatch);
  });
}

/*
  https://stackoverflow.com/questions/11160955/how-to-exclude-some-fields-from-the-document
  I came across this question looking for a way to exclude password hash from the json i served to the client,
  and select: false broke my verifyPassword function because it didn't retrieve the value from the database at all.
*/
UserSchema.methods.toJSON = function() {
  const obj = this.toObject();

  // Fields removed from response
  delete obj.password;
  return obj;
}

UserSchema.methods.incLoginAttempts = function(cb) {
    // if we have a previous lock that has expired, restart at 1
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return this.update({
            $set: { loginAttempts: 1 },
            $unset: { lockUntil: 1 }
        }, cb);
    }
    // otherwise we're incrementing
    var updates = { $inc: { loginAttempts: 1 } };
    // lock the account if we've reached max attempts and it's not locked already
    if (this.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS && !this.isLocked) {
        updates.$set = { lockUntil: Date.now() + LOCK_TIME };
    }
    return this.update(updates, cb);
};


const User = mongoose.model('User', UserSchema);

export default User;