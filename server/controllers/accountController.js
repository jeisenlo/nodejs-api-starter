import config from './../config/main';
import db from './../models';

const accountController = {};

// Only SuperAdmin users should be able to access this endpoint
accountController.getAll = async (req, res, next) => {
	req.assert('skip').optional().isInt({ min: 0 });
	req.assert('limit').optional().isInt({ min: 1, max: config.max_records });

	const errors = req.validationErrors();

	if (errors) {
		next(errors);
	}

	/*
	const errors = yield req.getValidationResult(); 
	OR
	req.getValidationResult().then( errors => {
	    if (!errors.isEmpty()) {
	      return res.status(400).json({ error: { msg: errors } });
	    }
    });*/

	const { skip, limit } = req.query;
	const recordSkip = parseInt(skip || 0, 10);
	const recordLimit = parseInt(limit || config.max_records, 10);

	try {

		let accounts = await db.Account.find({}).skip(recordSkip).limit(recordLimit);
		
		res.status(200).json({
	  		data: accounts,
		});

	} catch (err) {

	    console.log('Error getting all Accounts: ', err);
	    next(err);

	}

}

accountController.getById = async (req, res, next) => {

	try {

		let existingAccount = await db.Account.findOne({ 
			_id: req.user._account._id, 
		});

		res.status(200).json({
			data: existingAccount,
		});

	} catch (err) {

    	console.log('Error getting Account by Id: ', err);
    	next(err);

  	}

}

export default accountController;