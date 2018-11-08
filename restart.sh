#!/bin/bash

repo_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
if git --git-dir=${repo_dir}/.git --work-tree=${repo_dir} checkout master && git --git-dir=${repo_dir}/.git --work-tree=${repo_dir} fetch origin master && [ `git --git-dir=${repo_dir}/.git --work-tree=${repo_dir} rev-list HEAD...origin/master --count` != 0 ] && git --git-dir=${repo_dir}/.git --work-tree=${repo_dir} merge origin/master; then
  npm --prefix ${repo_dir} install ${repo_dir}
  forever restartall
else
  echo "current revision is up to date. restart not required."
fi
