# minions-managed-api

## installation:

### install git

```
sudo yum install -y git
```

### install mongodb
https://docs.mongodb.com/v3.0/tutorial/install-mongodb-on-amazon

create /etc/yum.repos.d/mongodb-org-3.0.repo

```
[mongodb-org-3.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/amazon/2013.03/mongodb-org/3.0/x86_64/
gpgcheck=0
enabled=1
```

install & start

```
sudo yum install -y mongodb-org
sudo service mongod start
```

### install nvm, node, npm & forever

```
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.32.0/install.sh | bash
export NVM_DIR="/home/ec2-user/.nvm"
nvm install 8.1.0
npm install -g forever
```

### redirect http requests on port 80 to the node app on port 3000

```
sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 -j REDIRECT --to-port 3000
# run port redirect on each boot
echo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 -j REDIRECT --to-port 3000 >> /etc/rc.local
```

## install & start the app

```
git clone https://github.com/minionator/minions-managed-api.git
cd minions-managed-api
npm install
forever start -l mm-forever.log -o mm-stdout.log -e mm-stderr.log server.js
```
