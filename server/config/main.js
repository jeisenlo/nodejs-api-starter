module.exports = {  
   // Secret key for JWT signing and encryption
   'secret': process.env.SECRET,
   // Database connection information
   'database': process.env.MONGODB_URL,
   // Setting port for server
   'port': process.env.PORT || 3000,
   // Max number of records per request
   'max_records': 200,
   'nodemailerOptions': {
		  service: 'SendGrid',
    	auth: {
          api_user: process.env.SENDGRID_USER,
      		api_key: process.env.SENDGRID_API_KEY,
    	},
    },
    'twilio': {
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
      twilioPhoneNumber: process.env.TWILIO_NUMBER,
    },
    'ap_support_email': 'support@test.com',
}