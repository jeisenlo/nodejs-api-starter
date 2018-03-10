import config from './config/main';
import app from './app';

app.listen(config.port, () => {
  console.log('Running on port ' + config.port + '...');
});
