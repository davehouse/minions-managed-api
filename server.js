var port       = 3000;
var cors       = require('cors');
var express    = require('express');
var mongoose   = require('mongoose');
var app        = express();
var bodyParser = require('body-parser');
var router     = express.Router();

var maxEventAgeInDays = {
  alive: 7,
  dead: 1,
  stats: 7
};
var maxQuietHoursBeforeAssumedDead = 3;

app.use(function(request, response, next) {
  if(request.headers['x-forwarded-proto']==='http') {
    return response.redirect(['https://', request.get('Host'), request.url].join(''));
  }
  next();
});
app.use(cors());
app.options('*', cors());

var MinionSchema = new mongoose.Schema({
  _id: mongoose.Schema.ObjectId,
  spotRequest: {
    id: String,
    created: Date,
    fulfilled: Date
  },
  instanceId: String,
  workerType: String,
  dataCenter: String,
  ipAddress: String,
  instanceType: String,
  created: Date,
  lastEvent: Date,
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
  router.get('/minion/:workerType/:period/stats', function(request, response) {
    var startDate = new Date(((function(d){d.setDate(d.getDate()-maxEventAgeInDays.stats);return d;})(new Date())).toDateString());
    var group = {};
    switch (request.params.period) {
      case 'year':
        group = {
          dataCenter: "$dataCenter",
          year: { $year: "$created" }
        };
        break;
      case 'month':
        group = {
          dataCenter: "$dataCenter",
          year: { $year: "$created" },
          month: { $month: "$created" }
        };
        break;
      case 'day':
        group = {
          dataCenter: "$dataCenter",
          year: { $year: "$created" },
          month: { $month: "$created" },
          day: { $dayOfMonth: "$created" }
        };
        break;
      case 'hour':
        group = {
          dataCenter: "$dataCenter",
          year: { $year: "$created" },
          month: { $month: "$created" },
          day: { $dayOfMonth: "$created" },
          hour: { $hour: "$created" }
        };
        break;
      case 'minute':
        group = {
          dataCenter: "$dataCenter",
          year: { $year: "$created" },
          month: { $month: "$created" },
          day: { $dayOfMonth: "$created" },
          hour: { $hour: "$created" },
          minute: { $minute: "$created" }
        };
        break;
      default:
        group = {
          dataCenter: "$dataCenter"
        };
        break;
    }
    Minion.aggregate(
      [
        {
          $match: {
            workerType: request.params.workerType,
            created: { $type: 9 },
            lastEvent: { $gt: startDate }
          }
        },
        {
          $group: {
            _id: group,
            count: { $sum: 1 }
          }
        }
      ],
      function(error, counts) {
        if (error) {
          return console.error(error);
        }
        response.json(counts);
      }
    );
  });
  router.get('/minion/:period/stats', function(request, response) {
    var startDate = new Date(((function(d){d.setDate(d.getDate()-maxEventAgeInDays.stats);return d;})(new Date())).toDateString());
    var group = {};
    switch (request.params.period) {
      case 'year':
        group = {
          workerType: "$workerType",
          year: { $year: "$created" }
        };
        break;
      case 'month':
        group = {
          workerType: "$workerType",
          year: { $year: "$created" },
          month: { $month: "$created" }
        };
        break;
      case 'day':
        group = {
          workerType: "$workerType",
          year: { $year: "$created" },
          month: { $month: "$created" },
          day: { $dayOfMonth: "$created" }
        };
        break;
      case 'hour':
        group = {
          workerType: "$workerType",
          year: { $year: "$created" },
          month: { $month: "$created" },
          day: { $dayOfMonth: "$created" },
          hour: { $hour: "$created" }
        };
        break;
      case 'minute':
        group = {
          workerType: "$workerType",
          year: { $year: "$created" },
          month: { $month: "$created" },
          day: { $dayOfMonth: "$created" },
          hour: { $hour: "$created" },
          minute: { $minute: "$created" }
        };
        break;
      default:
        group = {
          workerType: "$workerType"
        };
        break;
    }
    Minion.aggregate(
      [
        {
          $match: {
            created: { $type: 9 },
            lastEvent: { $gt: startDate }
          }
        },
        {
          $group: {
            _id: group,
            count: { $sum: 1 }
          }
        }
      ],
      function(error, counts) {
        if (error) {
          return console.error(error);
        }
        response.json(counts);
      }
    );
  });
  router.get('/minion/:state/count', function(request, response){
    var startDate = new Date(((function(d){d.setDate(d.getDate()-maxEventAgeInDays[request.params.state]);return d;})(new Date())).toDateString());
    var missingAssumedDead = new Date();
    missingAssumedDead.setHours(missingAssumedDead.getHours() - maxQuietHoursBeforeAssumedDead);
    var match = (request.params.state === 'dead') ? {
      $or: [ { terminated: { $exists: true } }, { lastEvent: { $lt: missingAssumedDead } } ],
      lastEvent: { $gt: startDate }
    } : {
      terminated: { $exists: false },
      lastEvent: { $gt: missingAssumedDead }
    };
    Minion.aggregate(
      [
        {
          $match: match
        },
        {
          $group: {
            _id: {
              workerType: "$workerType",
              dataCenter: "$dataCenter"
            },
            count: { $sum: 1 }
          }
        }
      ],
      function(error, counts) {
        if (error) {
          return console.error(error);
        }
        response.json(counts);
      }
    );
  });
  router.get('/minions/:state/:workerType/:dataCenter', function(request, response){
    var startDate = new Date(((function(d){d.setDate(d.getDate()-maxEventAgeInDays[request.params.state]);return d;})(new Date())).toDateString());
    var missingAssumedDead = new Date();
    missingAssumedDead.setHours(missingAssumedDead.getHours() - maxQuietHoursBeforeAssumedDead);
    var match = (request.params.state === 'dead') ? {
      $or: [ { terminated: { $exists: true } }, { lastEvent: { $lt: missingAssumedDead } } ],
      lastEvent: { $gt: startDate },
      workerType: request.params.workerType,
      dataCenter: request.params.dataCenter
    } : {
      terminated: { $exists: false },
      lastEvent: { $gt: missingAssumedDead },
      workerType: request.params.workerType,
      dataCenter: request.params.dataCenter
    };
    Minion.find(
      match,
      function(error, minions) {
        if (error) {
          return console.error(error);
        }
        response.json(minions);
      }
    );
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
      var id = mongoose.Types.ObjectId('0000000' + fqdn[0].slice(2));
      switch (event.program.toLowerCase()) {
        case 'generic-worker':
          if (event.message.match(/Running task https/i)) {
            var task = {
              id: event.message.split('#')[1],
              started: new Date(event.received_at)
            }
            Minion.findOneAndUpdate({ _id: id }, { instanceId: fqdn[0], workerType: fqdn[1], dataCenter: fqdn[2], ipAddress: event.source_ip, lastEvent: (new Date()), $push: { tasks: task } }, { upsert: true }, function(error, model) {
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
            Minion.findOneAndUpdate({ _id: id }, { instanceId: fqdn[0], workerType: fqdn[1], dataCenter: fqdn[2], ipAddress: event.source_ip, lastEvent: (new Date()), $set: { terminated: shutdown } }, { upsert: true }, function(error, model) {
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
            Minion.findOneAndUpdate({ _id: id }, { instanceId: fqdn[0], workerType: fqdn[1], dataCenter: fqdn[2], ipAddress: event.source_ip, lastEvent: (new Date()), $push: { restarts: shutdown } }, { upsert: true }, function(error, model) {
              console.log(fqdn[0] + ', restarted: ' + shutdown.comment);
              if (error) {
                return console.error(error);
              } else {
                console.log(model);
              }
            });
          }
          break;
        case 'haltonidle':
          if (event.message.match(/termination notice received/i)) {
            var shutdown = {
              time: new Date(event.received_at),
              user: 'amazon',
              comment: 'termination notice received'
            }
            Minion.findOneAndUpdate({ _id: id }, { instanceId: fqdn[0], workerType: fqdn[1], dataCenter: fqdn[2], ipAddress: event.source_ip, lastEvent: (new Date()), $set: { terminated: shutdown } }, { upsert: true }, function(error, model) {
              console.log(fqdn[0] + ', terminated: ' + shutdown.comment);
              if (error) {
                return console.error(error);
              } else {
                console.log(model);
              }
            });
          }
          break;
        case 'opencloudconfig':
          if (event.message.match(/instanceType/i)) {
            var instance = {
              instanceId: fqdn[0],
              workerType: fqdn[1],
              dataCenter: fqdn[2],
              ipAddress: event.source_ip,
              instanceType: event.message.match(/instanceType: (.*)\./i)[1],
              lastEvent: new Date()
            };
            Minion.findOneAndUpdate({ _id: id }, instance, { upsert: true }, function(error, model) {
              console.log('update: ' + instance._id);
              if (error) {
                return console.error(error);
              } else {
                console.log(model);
              }
            });
          } else if (event.message.match(/host renamed from/i)) {
            // at the time this message is created, the host still has its parents name.
            // the correct name is extracted from the message
            var instanceId = event.message.split(' to ')[1].trim().slice(0, -1);
            id = mongoose.Types.ObjectId('0000000' + instanceId.slice(2));
            var instance = {
              instanceId: instanceId,
              workerType: fqdn[1],
              dataCenter: fqdn[2],
              ipAddress: event.source_ip,
              created: new Date(event.received_at),
              lastEvent: new Date()
            };
            Minion.findOneAndUpdate({ _id: id }, instance, { upsert: true }, function(error, model) {
              console.log('create: ' + instance._id);
              if (error) {
                return console.error(error);
              } else {
                console.log(model);
              }
            });
          }
          break;
        case 'app/web.1':
          var instanceId = event.message.match(/id=(i-[0-9a-f]*)/i)[1];
          id = mongoose.Types.ObjectId('0000000' + instanceId.slice(2));
          var spotRequest = (event.message.match(/state=running/i)) ? {
            id: event.message.match(/srid=(sir-[^\)]*)/i)[1],
            fulfilled: new Date(event.received_at)
          } : {
            id: event.message.match(/srid=(sir-[^\)]*)/i)[1],
            created: new Date(event.received_at)
          };
          var instance = {
            spotRequest: spotRequest,
            instanceId: instanceId,
            workerType: event.message.match(/workerType=([^,]*)/i)[1],
            instanceType: event.message.match(/instanceType=([^,]*)/i)[1],
            lastEvent: new Date()
          };
          Minion.findOneAndUpdate({ _id: id }, instance, { upsert: true }, function(error, model) {
            console.log('update: ' + instance._id);
            if (error) {
              return console.error(error);
            } else {
              console.log(model);
            }
          });
          break;
      }
    });
  });
});
app.use(router);
app.listen(port);
console.log('listening on port ' + port);

