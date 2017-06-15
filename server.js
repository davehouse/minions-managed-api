var port       = 3000;
var express    = require('express');
var mongoose   = require('mongoose');
var app        = express();
var bodyParser = require('body-parser');
var router     = express.Router();

var MinionSchema = new mongoose.Schema({
  _id: mongoose.Schema.ObjectId,
  instanceId: String,
  workerType: String,
  dataCenter: String,
  ipAddress: String,
  created: Date,
  restarts: [
    {
      time: Date,
      user: String,
      comment: String
    }
  ],
  tasks: [
    {
      id: String,
      started: Date
    }
  ],
  terminated: {
    time: Date,
    user: String,
    comment: String
  }
});
var Minion = mongoose.model(
  'minion',
  MinionSchema
);

app.use(bodyParser.json({
  limit: '50mb',
  type: 'application/json'
}));
app.use(bodyParser.urlencoded({
  limit: '50mb',
  extended: true,
  type: 'application/x-www-form-urlencoded'
}));

mongoose.connect('localhost', 'minions-managed');
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
  router.get('/minions/alive', function(request, response){
    Minion.find({ terminated: undefined }, function(error, minions) {
      if (error) {
        return console.error(error);
      }
      response.json(minions);
    });
  });
  router.get('/minions/dead', function(request, response){
    Minion.find({ terminated: { $exists: true } }, function(error, minions) {
      if (error) {
        return console.error(error);
      }
      response.json(minions);
    });
  });
  router.get('/minion/:id', function(request, response){
    Minion.findById(request.params.id, function(error, minion) {
      if (error) {
        return console.error(error);
      }
      response.json(minion);
    });
  });
  router.post('/events', function(request, response) {
    JSON.parse(request.body.payload).events.forEach(function(event) {
      var fqdn = event.hostname.split('.');
      if (event.program.match(/OpenCloudConfig/i) && event.message.match(/host renamed from/i)) {
        // at the time this message is created, the host still has its parents name.
        // the correct name is extracted from the message
        var instanceId = event.message.split(' to ')[1].trim().slice(0, -1)
        var id = mongoose.Types.ObjectId('0000000' + instanceId.slice(2));
        var instance = {
          instanceId: instanceId,
          workerType: fqdn[1],
          dataCenter: fqdn[2],
          ipAddress: event.source_ip,
          created: new Date(event.received_at)
        }
        Minion.findOneAndUpdate({ _id: id }, instance, { upsert: true }, function(error, model) {
          console.log('create: ' + instance._id);
          if (error) {
            return console.error(error);
          } else {
            console.log(model);
          }
        });
      } else {
        var id = mongoose.Types.ObjectId('0000000' + fqdn[0].slice(2));
        switch (event.program.toLowerCase()) {
          case 'generic-worker':
            if (event.message.match(/Running task https/i)) {
              var task = {
                id: event.message.split('#')[1],
                started: new Date(event.received_at)
              }
              Minion.findOneAndUpdate({ _id: id }, { instanceId: fqdn[0], workerType: fqdn[1], dataCenter: fqdn[2], ipAddress: event.source_ip, $push: { tasks: task } }, { upsert: true }, function(error, model) {
                console.log(fqdn[0] + ', task: ' + task.id);
                if (error) {
                  return console.error(error);
                } else {
                  console.log(model);
                }
              });
            }
            break;
          case 'user32':
            if (event.message.match(/has initiated the shutdown of computer/i)) {
              var shutdown = {
                time: new Date(event.received_at),
                user: event.message.match(/on behalf of user (.*) for the following reason/i)[1],
                comment: event.message.split('   Comment: ')[1]
              }
              Minion.findOneAndUpdate({ _id: id }, { instanceId: fqdn[0], workerType: fqdn[1], dataCenter: fqdn[2], ipAddress: event.source_ip, $set: { terminated: shutdown } }, { upsert: true }, function(error, model) {
                console.log(fqdn[0] + ', terminated: ' + shutdown.comment);
                if (error) {
                  return console.error(error);
                } else {
                  console.log(model);
                }
              });
            } else if (event.message.match(/has initiated the restart of computer/i)) {
              var shutdown = {
                time: new Date(event.received_at),
                user: event.message.match(/on behalf of user (.*) for the following reason/i)[1],
                comment: event.message.split('   Comment: ')[1]
              }
              Minion.findOneAndUpdate({ _id: id }, { instanceId: fqdn[0], workerType: fqdn[1], dataCenter: fqdn[2], ipAddress: event.source_ip, $push: { restarts: shutdown } }, { upsert: true }, function(error, model) {
                console.log(fqdn[0] + ', restarted: ' + shutdown.comment);
                if (error) {
                  return console.error(error);
                } else {
                  console.log(model);
                }
              });
            }
            break;
        }
      }
    });
  });
});
app.use(router);
app.listen(port);
console.log('listening on port ' + port);
