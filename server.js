const port       = 3000;
const express    = require('express');
const cors       = require('cors');
const mongoose   = require('mongoose');
const bodyParser = require('body-parser');

var app          = express();
var router       = express.Router();

var maxEventAgeInDays = {
  alive: 7,
  dead: 1,
  stats: 3
};
var maxQuietHoursBeforeAssumedDead = 3;

function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

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
  lastEvent: {
    type: Date,
    expires: (60 * 60 * 24 * maxEventAgeInDays.stats),
    default: Date.now
  },
  restarts: [
    {
      time: Date,
      user: String,
      comment: String,
      completed: Date
    }
  ],
  tasks: [
    {
      id: String,
      started: Date,
      completed: Date,
      result: String
    }
  ],
  jobs: [
    {
      name: String,
      started: Date,
      completed: Date
    }
  ],
  terminated: {
    time: Date,
    user: String,
    comment: String
  }
});
// MinionSchema.index({ lastEvent: 1 }, { expireAfterSeconds: (60 * 60 * 24 * 30) });
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
  router.get('/list/:workerType/:dataCenter?/:taskCount?', function(request, response){
    var taskCount = 5;
    var match = {
      workerType: request.params.workerType
    };
    if (request.params.dataCenter !== undefined) {
      match.dataCenter = request.params.dataCenter;
    }
    if (request.params.taskCount !== undefined) {
      taskCount = request.params.taskCount;
    }
    var projection = {
      'instanceId': true,
      'taskCount': { $size: "$tasks" },
      'tasks': { $slice: -taskCount },
      'restartCount': { $size: "$restarts" },
      'restarts': { $slice: -taskCount },
      'created': true,
      'lastEvent': true
    };
    Minion.find(
      match,
      projection,
      function(error, minions) {
        if (error) {
          return console.error(error);
        }
        response.json(minions);
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
  router.get('/minions/:state/:workerType/:dataCenter/:limit', function(request, response){
    var missingAssumedDead = new Date();
    missingAssumedDead.setHours(missingAssumedDead.getHours() - maxQuietHoursBeforeAssumedDead);
    var sortAndLimit = (request.params.state === 'alive') ? {
      sort: '-lastEvent',
      limit: (parseInt(request.params.limit) || 10)
    } : {
      sort: '-lastEvent',
      limit: (parseInt(request.params.limit) || 10)
    };
    var match = (request.params.state === 'dead') ? {
      $or: [ { terminated: { $exists: true } }, { lastEvent: { $lt: missingAssumedDead } } ],
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
      null,
      sortAndLimit,
      function(error, minions) {
        if (error) {
          return console.error(error);
        }
        response.json(minions);
      }
    );
  });
  router.post('/events', function(request, response) {
    JSON.parse(request.body.payload).events.forEach(function(event) {
      var workerTypeMap = {
        'gecko-t-win10-64-hw': {
          code: '00',
          name: 't-w1064-ms-'
        },
        'gecko-t-win7-32-hw': {
          code: '01',
          name: 't-w732-ms-'
        },
        'gecko-t-osx-1010': {
          code: '02',
          name: 't-yosemite-r7-'
        },
        'gecko-t-linux-talos': {
          code: '03',
          name: 't-linux64-ms-'
        },
        'gecko-t-win10-64-ux': {
          code: '04',
          name: 't-w1064-ms-'
        }
      };
      var unmappedWorkerType = {
        code: '09'
      };
      var fqdn = event.hostname.split('.');
      var hostname = fqdn[0].toLowerCase();
      var workerType = (hostname.startsWith('i-'))
        ? fqdn[1]
        : (hostname.startsWith('t-w1064-ms-'))
          ? 'gecko-t-win10-64-hw'
          : (hostname.startsWith('t-w732-ms-'))
            ? 'gecko-t-win7-32-hw'
            : (hostname.startsWith('t-yosemite-r7-'))
              ? 'gecko-t-osx-1010'
              : (hostname.startsWith('t-linux64-ms-'))
                ? 'gecko-t-linux-talos'
                : (hostname.startsWith('t-w1064-ux-'))
                  ? 'gecko-t-win10-64-ux'
                  : hostname.slice(0, -4);
      var dataCenter = (hostname.startsWith('i-'))
        ? fqdn[2] // ec2 win
        : (hostname.startsWith('t-w'))
          ? fqdn[1] // win7 & win10
          : fqdn[3]; // yosemite & linux
      var id = (hostname.startsWith('i-'))
        ? mongoose.Types.ObjectId(pad(hostname.slice(2), 24))
        : (hostname.startsWith('t-'))
          ? mongoose.Types.ObjectId(pad((workerTypeMap[workerType] || unmappedWorkerType).code + '00' + hostname.slice(-3), 24))
          : {};
      switch (event.program.toLowerCase()) {
        case 'generic-worker':
          if (event.message.match(/No task claimed/i)) {
            Minion.findOneAndUpdate(
              {
                _id: id
              },
              {
                instanceId: hostname,
                workerType: workerType,
                dataCenter: dataCenter,
                ipAddress: event.source_ip,
                lastEvent: (new Date((new Date()).toISOString()))
              },
              { upsert: true },
              function(error, model) {
                console.log(workerType + ' ' + hostname + ' - idle');
                if (error) {
                  return console.error(error);
                }
              }
            );
          } else if (event.message.match(/Running task https/i)) {
            var task = {
              id: event.message.split('#')[1].split('/')[0],
              started: new Date(event.received_at)
            };
            Minion.findOneAndUpdate(
              {
                _id: id
              },
              {
                instanceId: hostname,
                workerType: workerType,
                dataCenter: dataCenter,
                ipAddress: event.source_ip,
                lastEvent: (new Date((new Date()).toISOString())),
                $push: {
                  tasks: task
                }
              },
              { upsert: true },
              function(error, model) {
                console.log(workerType + ' ' + hostname + ' - task started: ' + task.id);
                if (error) {
                  return console.error(error);
                }
              }
            );
          } else if (event.message.match(/finished successfully/i)) {
            var taskId = event.message.match(/Task (.*) finished successfully/i)[1];
            Minion.update(
              {
                _id: id,
                tasks: {
                  $elemMatch: {
                    id: { $regex: taskId } // todo: remove regex when data has had time to correct.
                  }
                }
              },
              {
                lastEvent: (new Date((new Date()).toISOString())),
                $set: {
                  "tasks.$.completed" : new Date(event.received_at),
                  "tasks.$.result" : 'Success'
                }
              },
              function(error, model) {
                console.log(workerType + ' ' + hostname + ' - task success: ' + taskId);
                if (error) {
                  return console.error(error);
                }
              }
            );
          } else if (event.message.match(/ERROR\(s\) encountered/i)) {
            var taskResult = event.message.match(/(ERROR\(s\) encountered: .*)/)[1];
            Minion.update(
              {
                _id: id,
                tasks: {
                  $elemMatch: {
                    // match a task started in the last 3 hours
                    started: { $gte: new Date((new Date()).getTime() - (3 * 60 * 60 * 1000)) },
                    completed: { $exists: false },
                    result: { $exists: false }
                  }
                }
              },
              {
                lastEvent: (new Date((new Date()).toISOString())),
                $set: {
                  "tasks.$.completed" : new Date(event.received_at),
                  "tasks.$.result" : taskResult
                }
              },
              function(error, model) {
                console.log(workerType + ' ' + hostname + ' - task failure: ' + taskResult);
                if (error) {
                  return console.error(error);
                }
              }
            );
          }
          break;
        case 'user32':
          if (event.message.match(/has initiated the shutdown of computer/i)) {
            var shutdown = {
              time: new Date(event.received_at),
              user: event.message.match(/on behalf of user (.*) for the following reason/i)[1],
              comment: event.message.split('   Comment: ')[1]
            };
            Minion.findOneAndUpdate(
              {
                _id: id
              },
              {
                instanceId: hostname,
                workerType: workerType,
                dataCenter: dataCenter,
                ipAddress: event.source_ip,
                lastEvent: (new Date((new Date()).toISOString())),
                $set: {
                  terminated: shutdown
                }
              },
              {
                upsert: true
              },
              function(error, model) {
                console.log(workerType + ' ' + hostname + ' - terminated: ' + shutdown.comment);
                if (error) {
                  return console.error(error);
                }
              }
            );
          } else if (event.message.match(/has initiated the restart of computer/i)) {
            var shutdown = {
              time: new Date(event.received_at),
              user: event.message.match(/on behalf of user (.*) for the following reason/i)[1],
              comment: event.message.split('   Comment: ')[1] || ''
            };
            Minion.findOneAndUpdate(
              {
                _id: id
              },
              {
                instanceId: hostname,
                workerType: workerType,
                dataCenter: dataCenter,
                ipAddress: event.source_ip,
                lastEvent: (new Date((new Date()).toISOString())),
                $push: {
                  restarts: shutdown
                }
              },
              {
                upsert: true
              },
              function(error, model) {
                console.log(workerType + ' ' + hostname + ' - restart triggered: ' + shutdown.comment);
                if (error) {
                  return console.error(error);
                }
              }
            );
          }
          break;
        case 'DeployStudio':
          if (event.message.match(/Running autostarted workflow:/)) {
            var instance = {
              instanceId: hostname,
              workerType: workerType,
              dataCenter: dataCenter,
              ipAddress: event.source_ip,
              created: new Date(event.received_at),
              lastEvent: (new Date((new Date()).toISOString()))
            };
            Minion.findOneAndUpdate(
              {
                _id: id,
              },
              instance,
              {
                upsert: true
              },
              function(error, model) {
                console.log(workerType + ' ' + hostname + ' - reimaged: ' + new Date(event.received_at));
                if (error) {
                  return console.error(error);
                }
              }
            );
          }
          break;
        case 'nxlog':
        case 'cron':
        case 'bird':
          if (event.message.match(/INFO nxlog-ce-[\.0-9]* started/i) || event.message.match(/RELOAD/i) || event.message.match(/reachability/i)) {
            Minion.update(
              {
                _id: id,
                restarts: {
                  $elemMatch: {
                    // match a restart triggered in the last 6 minutes
                    time: { $gte: new Date((new Date()).getTime() - (6 * 60 * 1000)) },
                    completed: { $exists: false }
                  }
                }
              },
              {
                lastEvent: (new Date((new Date()).toISOString())),
                $set: {
                  "restarts.$.completed" : new Date(event.received_at)
                }
              },
              function(error, model) {
                console.log(workerType + ' ' + hostname + ' - restart completed: ' + new Date(event.received_at));
                if (error) {
                  return console.error(error);
                }
              }
            );
          }
          break;
        case 'puppet-agent':
          if (event.message.match("/Stage[main]/Users::Roller::Setup/Ssh::Userconfig[roller]/File[/home/roller/.ssh]/ensure")) {
            var instance = {
              instanceId: hostname,
              workerType: workerType,
              dataCenter: dataCenter,
              ipAddress: event.source_ip,
              created: new Date(event.received_at),
              lastEvent: (new Date((new Date()).toISOString()))
            };
            Minion.findOneAndUpdate(
              {
                _id: id
              },
              instance,
              {
                upsert: true
              },
              function(error, model) {
                console.log(workerType + ' ' + hostname + ' - reimaged');
                if (error) {
                  return console.error(error);
                }
              }
            );
          }
          break;
        case 'sudo':
          if (event.message.match(/reboot/i)) {
            var shutdown = {
              time: new Date(event.received_at),
              user: 'cltbld', // todo: parse the username out of the message
              comment: event.message.trim()
            }
            Minion.findOneAndUpdate(
              {
                _id: id
              },
              {
                instanceId: hostname,
                workerType: workerType,
                dataCenter: dataCenter,
                ipAddress: event.source_ip,
                lastEvent: (new Date((new Date()).toISOString())),
                $push: {
                  restarts: shutdown
                }
              },
              {
                upsert: true
              },
              function(error, model) {
                console.log(workerType + ' ' + hostname + ' - restarted: ' + shutdown.comment);
                if (error) {
                  return console.error(error);
                }
              }
            );
          }
          break;
        case 'haltonidle':
          if (event.message.match(/termination notice received/i)) {
            var shutdown = {
              time: new Date(event.received_at),
              user: 'amazon',
              comment: 'termination notice received'
            }
            Minion.findOneAndUpdate(
              {
                _id: id
              },
              {
                instanceId: hostname,
                workerType: workerType,
                dataCenter: dataCenter,
                ipAddress: event.source_ip,
                lastEvent: (new Date((new Date()).toISOString())),
                $set: {
                  terminated: shutdown
                }
              },
              {
                upsert: true
              },
              function(error, model) {
                console.log(workerType + ' ' + hostname + ' - terminated: ' + shutdown.comment);
                if (error) {
                  return console.error(error);
                }
              }
            );
          }
          break;
        case 'opencloudconfig':
          if (event.message.match(/instanceType/i)) {
            var instance = {
              instanceId: hostname,
              workerType: workerType,
              dataCenter: dataCenter,
              ipAddress: event.source_ip,
              instanceType: event.message.match(/instanceType: (.*)\./i)[1],
              lastEvent: (new Date((new Date()).toISOString()))
            };
            Minion.findOneAndUpdate(
              {
                _id: id
              },
              instance,
              {
                upsert: true
              },
              function(error, model) {
                console.log(workerType + ' ' + hostname + ' - update instance id: ' + instance._id);
                if (error) {
                  return console.error(error);
                }
              }
            );
          } else if (event.message.match(/host renamed from/i)) {
            // at the time this message is created, the host still has its parents name.
            // the correct name is extracted from the message
            var instanceId = event.message.split(' to ')[1].trim().slice(0, -1);
            id = mongoose.Types.ObjectId(pad(instanceId.slice(2), 24));
            var instance = {
              instanceId: instanceId,
              workerType: workerType,
              dataCenter: dataCenter,
              ipAddress: event.source_ip,
              created: new Date(event.received_at),
              lastEvent: (new Date((new Date()).toISOString()))
            };
            Minion.findOneAndUpdate(
              {
                _id: id
              },
              instance,
              {
                upsert: true
              },
              function(error, model) {
                console.log(workerType + ' ' + instanceId + ', create: ' + id);
                if (error) {
                  return console.error(error);
                }
              }
            );
          } else if (event.message.match(/[-_a-z0-9]* :: begin - /i)) {
            var matchItems = event.message.match(/([-_a-z0-9]*) :: begin - (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,7}Z)/i);
            var job = {
              name: event.program + '/' + matchItems[1],
              started: new Date(matchItems[2])
            };
            Minion.findOneAndUpdate(
              {
                _id: id
              },
              {
                instanceId: hostname,
                workerType: workerType,
                dataCenter: dataCenter,
                ipAddress: event.source_ip,
                lastEvent: (new Date((new Date()).toISOString())),
                $push: {
                  jobs: job
                }
              },
              {
                upsert: true
              },
              function(error, model) {
                console.log(workerType + ' ' + hostname + ' - job started: ' + job.name + ' ' + new Date(matchItems[2]));
                if (error) {
                  return console.error(error);
                }
              }
            );
          } else if (event.message.match(/[-_a-z0-9]* :: end - /i)) {
            var matchItems = event.message.match(/([-_a-z0-9]*) :: end - (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,7}Z)/i);
            Minion.update(
              {
                _id: id,
                jobs: {
                  $elemMatch: {
                    name: event.program + '/' + matchItems[1],
                    completed: { $exists: false }
                  }
                }
              },
              {
                lastEvent: (new Date((new Date()).toISOString())),
                $set: {
                  "jobs.$.completed" : new Date(matchItems[2])
                }
              },
              function(error, model) {
                console.log(workerType + ' ' + hostname + ' - job completed: ' + event.program + '/' + matchItems[1] + ' ' + new Date(matchItems[2]));
                if (error) {
                  return console.error(error);
                }
              }
            );
          }
          break;
        case 'app/web.1':
          var workerType = event.message.match(/workerType=([^,]*)/i)[1];
          if (workerType.includes('-win')) {
            var instanceId = event.message.match(/id=(i-[0-9a-f]{17})/i)[1];
            id = mongoose.Types.ObjectId('0000000' + instanceId.slice(2));
            var region = event.message.match(/region=([^,]*)/i)[1];
            var instance = (event.message.match(/state=running/i)) ? {
              'spotRequest.id': event.message.match(/srid=(sir-[^\)]*)/i)[1],
              'spotRequest.fulfilled': new Date(event.received_at),
              instanceId: instanceId,
              workerType: workerType,
              dataCenter: region.slice(0, 2) + region.slice(3, 4) + region.slice(-1),
              instanceType: event.message.match(/instanceType=([^,]*)/i)[1],
              lastEvent: (new Date((new Date()).toISOString()))
            } : {
              'spotRequest.id': event.message.match(/srid=(sir-[^\)]*)/i)[1],
              'spotRequest.created': new Date(event.received_at),
              instanceId: instanceId,
              workerType: workerType,
              dataCenter: region.slice(0, 2) + region.slice(3, 4) + region.slice(-1),
              instanceType: event.message.match(/instanceType=([^,]*)/i)[1],
              lastEvent: (new Date((new Date()).toISOString()))
            };
            Minion.findOneAndUpdate(
              {
                _id: id
              },
              instance,
              {
                upsert: true
              },
              function(error, model) {
                console.log(workerType + ' ' + instanceId + ', update: ' + instance._id);
                if (error) {
                  return console.error(error);
                }
              }
            );
          }
          break;
      }
    });
    // purge old tasks, jobs & restarts
    var purgeDate = new Date((new Date()).getDate() - maxEventAgeInDays.stats);
    Minion.update(
      {},
      {
        $pull: {
          "tasks": {
            started: {
              $lte: purgeDate
            }
          },
          "jobs": {
            started: {
              $lte: purgeDate
            }
          },
          "restarts": {
            time: {
              $lte: purgeDate
            }
          }
        }
      },
      {
        multi: true
      },
      function(error, model) {
        if (error) {
          return console.error(error);
        } else {
          console.log(model);
        }
      }
    );
    Minion.remove(
      {
        lastEvent: {
          $lte: purgeDate
        }
      },
      function(error, model) {
        if (error) {
          return console.error(error);
        } else {
          console.log(model);
        }
      }
    );
    ['mdc1', 'mdc2', 'mtv2'].forEach(function(dataCenter) {
      Minion.update(
        {
          dataCenter: dataCenter
        },
        {
          $pull: {
            "tasks": {
              started: {
                $lte: (new Date((new Date()).getDate() - 2))
              }
            }
          }
        },
        {
          multi: true
        },
        function(error, model) {
          if (error) {
            return console.error(error);
          } else {
            console.log(model);
          }
        }
      );
      Minion.update(
        {
          dataCenter: dataCenter
        },
        {
          $pull: {
            "jobs": {
              started: {
                $lte: (new Date((new Date()).getDate() - 2))
              }
            }
          }
        },
        {
          multi: true
        },
        function(error, model) {
          if (error) {
            return console.error(error);
          } else {
            console.log(model);
          }
        }
      );
      Minion.update(
        {
          dataCenter: dataCenter
        },
        {
          $pull: {
            "restarts": {
              time: {
                $lte: (new Date((new Date()).getDate() - 2))
              }
            }
          }
        },
        {
          multi: true
        },
        function(error, model) {
          if (error) {
            return console.error(error);
          } else {
            console.log(model);
          }
        }
      );
    });
  });
});
app.use(router);
app.listen(port);
console.log('listening on port ' + port);

