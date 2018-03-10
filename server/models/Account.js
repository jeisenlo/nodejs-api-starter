import mongoose from 'mongoose';

const { Schema } = mongoose;

const AccountSchema = new Schema({
	_creator: {
		type: Schema.ObjectId, 
		ref: 'User', 
		required: false,
	},
	name: {
		type: String,
		required: true,
	},
	description: {
		type: String,
	},
	isVerified: {
		type: Boolean,
		default: false,
	},
	isDeleted: { 
		type: Boolean, 
		default: false,
	},
},
{
  timestamps: true,
});

const Account = mongoose.model('Account', AccountSchema);

export default Account;