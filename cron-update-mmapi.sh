#!/bin/bash -e

shopt -s extglob

/usr/bin/git --git-dir=/home/ec2-user/minions-managed/.git --work-tree=/home/ec2-user/minions-managed remote update
if [[ $(/usr/bin/git --git-dir=/home/ec2-user/minions-managed/.git --work-tree=/home/ec2-user/minions-managed status -uno) != *"Your branch is up-to-date with 'origin/master'."* ]]; then
  /usr/bin/git --git-dir=/home/ec2-user/minions-managed/.git --work-tree=/home/ec2-user/minions-managed pull
  /home/ec2-user/.nvm/versions/node/v6.11.0/bin/forever restart 0 || /home/ec2-user/.nvm/versions/node/v6.11.0/bin/forever start -a -l mm-forever.log -o /home/ec2-user/mm-stdout.log -e /home/ec2-user/mm-stderr.log /home/ec2-user/minions-managed/server.js > /home/ec2-user/cron/log/forever-restart.log
fi