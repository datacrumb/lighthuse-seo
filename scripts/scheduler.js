const https = require('https');

const options = {
  hostname: 'page-speed-insight-076bd75423a9.herokuapp.com',
  path: '/api/run-analysis',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  res.on('data', (d) => {
    process.stdout.write(d);
  });
  res.on('end', () => {
    console.log('\nProcessing complete!');
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error(e);
  process.exit(1);
});

req.end(); 