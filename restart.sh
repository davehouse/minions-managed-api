#!/bin/bash

if git checkout master && git fetch origin master && [ `git rev-list HEAD...origin/master --count` != 0 ] && git merge origin/master; then
  npm install
  forever restartall
else
  echo "current revision is up to date. restart not required."
fi
