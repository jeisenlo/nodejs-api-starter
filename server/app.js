import express from 'express';
import mongoose from 'mongoose';
import helmet from 'helmet';
import compression from 'compression';
import logger from 'morgan';
import RateLimit from 'express-rate-limit';
import passport from 'passport';
import bodyParser from 'body-parser';
import expressValidator from 'express-validator';
import path from 'path';
import fs from 'fs';
import boom from 'boom';

// Import configuration files
import config from './config/main';
import passportConfig from './config/passport';

// Import routes from './routes';
//import routes from './routes';
import apiV1 from './routes';

mongoose.Promise = global.Promise;

/*mongoose.connect(config.database, () => {
  console.log('Connected to mongodb on port ' + config.port);
});*/

const dbPromise = mongoose.connect(config.database);
dbPromise.then( db => {
	console.log('Connected to mongodb on port ' + config.port);
});


const app = express();

// MIDDLEWARE

// It's best to use Helmet early in your middleware stack so that its headers are sure to be set.
app.use(helmet());
app.use(compression());

//app.enable('trust proxy'); // only if you're behind a reverse proxy (Heroku, Bluemix, AWS if you use an ELB, custom Nginx setup, etc)

// Log requests to API using morgan
//app.use(logger('dev'));
// create a write stream (in append mode)
var accessLogStream = fs.createWriteStream(path.join(__dirname, 'access.log'), {flags: 'a'})
// setup the logger
app.use(logger('combined', {stream: accessLogStream}))

// Limit the number of requests
var limiter = new RateLimit({
  windowMs: 15*60*1000, // 15 minutes 
  max: 100, // limit each IP to 100 requests per windowMs 
  delayMs: 0, // disable delaying - full speed until the max limit is reached
});
//  apply to all requests 
app.use(limiter);
// only apply to requests that begin with /api/ 
//app.use('/api/', limiter);

app.use(passport.initialize());

// Enable CORS from client-side
app.use( (req, res, next) => {  
  res.header("Access-Control-Allow-Origin", "*");
  res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Access-Control-Allow-Credentials");
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

app.use(bodyParser.urlencoded({ extended: true }));  
app.use(bodyParser.json());

app.use(expressValidator({
	customValidators: {
	    isArray: function(value) {
	        return Array.isArray(value);
	    },
	    arrayNotEmpty: function(array) {
	        return array.length > 0;
	    },
	    gte: function(param, num) {
	        return param >= num;
	    },
	    lte: function(param, num) {
	    	return param <= num;
	    },
	}
})); // this line must be immediately after any of the bodyParser middlewares!

// Escape every item in the request body
/*app.use(function(req, res, next) {
  for (var item in req.body) {
    req.sanitize(item).escape();
  }
  next();
});*/

// Initializing route groups
const apiRoutes = express.Router();
// Set url for API group routes
app.use('/api', apiRoutes);
// Allow for easier API versioning changes
apiRoutes.use('/v1', apiV1);


// catch 404 and forward to error handler
app.use( (req, res, next) => {
  //Boom.notFound('Not Found');
	const err = new Error('Not Found');
	err.status = 404;
	next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
	app.use( (err, req, res, next) => {
  	res.status(err.status || 500).json({ error: { msg: err.message, error: err } });
	});
  //if (err.isServer) {
    // log the error...
    // probably you don't want to log unauthorized access
    // or do you?
  //}
  //return res.status(err.output.statusCode).json(err.output.payload);
}

// production error handler
// no stacktraces leaked to user
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: { msg: err.message } });
  //if (err.isServer) {
    // log the error...
    // probably you don't want to log unauthorized access
    // or do you?
  //}
  //return res.status(err.output.statusCode).json(err.output.payload);
})


export default app;