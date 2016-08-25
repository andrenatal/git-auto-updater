
const ChildProcess = require('child_process');
const Fs = require('fs');
const Path = require('path');

var conf = {
  // Repository URI to clone from
  repository: null,

  // Branch to check out and update
  branch: 'master',

  // Path of repository
  path: null,

  // Frequency to check for updates, in minutes
  frequency: 1440,

  // Time to check for updates, overrides frequency
  time: null,

  // Signal to send to command when performing update
  signal: 'SIGINT',

  // Frequency with which to retry after errors, in minutes (0 = exit)
  errorFrequency: 5,

  // Whether the repository has been successfully cloned or not
  cloned: false,

  // Command to run when not updating
  command: null,
};

// The spawned command process
var commandProcess = null;
var total_boots = 0;

function printUsage() {
  ['usage: git-auto-updater [options] [-- [command]]',
   '',
   'Periodically checks a git repository for updates and runs a command',
   'between updates.',
   '',
   'options:',
   '  -h, --help          print this message',
   '  -r, --repository    git repository URI',
   '  -b, --branch        git branch (Default: master)',
   '  -p, --path          local clone path (Default: repository name)',
   '  -f, --frequency     update check frequency, in minutes (Default: 1440)',
   '  -t, --time          update check time, overrides frequency, HHMM (e.g. 0200)',
   '  -s, --signal        signal to terminate command (Default: SIGINT)',
   '  -e, --error-retry   update check frequency after an error, in minutes.',
   '                      Specifying zero exits on errors. (Default: 5)',
   '  --                  stop processing command line arguments'].
    forEach(string => { console.log(string); });
}

function parseArguments() {
  var args = process.argv.splice(1);
  var buildingCommand = false;
  while (args.length) {
    var arg = args[0];
    args.shift();

    if (buildingCommand) {
      if (!conf.command) {
        conf.command = { name: arg, args: [] };
      } else {
        conf.command.args.push(arg);
      }
      continue;
    }

    switch(arg) {
      case '-h':
      case '--help':
        printUsage();
        process.exit(0);

      case '-r':
      case '--repository':
        conf.repository = args[0];
        args.shift();
        break;

      case '-b':
      case '--branch':
        conf.branch = args[0];
        args.shift();
        break;

      case '-p':
      case '--path':
        conf.path = args[0];
        args.shift();
        break;

      case '-f':
      case '--frequency':
        conf.frequency = Number.parseInt(args[0]);
        args.shift();
        break;

      case '-t':
      case '--time':
        var time = Number.parseInt(args[0]);
        conf.time = { hours: Math.min(Math.floor(time / 100), 23),
                      minutes: Math.min(time % 100, 59) };
        args.shift();
        break;

      case '-s':
      case '--signal':
        conf.signal = args[0];
        args.shift();
        break;

      case '-e':
      case '--error-retry':
        conf.errorFrequency = Number.parseInt(args[0]);
        args.shift();
        break;

      case '--':
        buildingCommand = true;
        break;
    }
  }
}

function validateConfiguration() {
  // If a path wasn't given but we have a repository URI, try to get the
  // path from that.
  if (!conf.path && conf.repository) {
    conf.path = Path.basename(conf.repository, '.git');
  }

  if (!conf.repository && !conf.path) {
    return false;
  }

  if (!conf.time && (!Number.isInteger(conf.frequency) || conf.frequency < 1)) {
    return false;
  }

  return true;
}

function startCommand() {
  if (conf.command) {
    total_boots++;
    conf.command.args[1] = total_boots;
    console.log('start vaani', conf.command.args);
    commandProcess = ChildProcess.spawn(conf.command.name, conf.command.args,
      { stdio: 'inherit' });
    commandProcess.on('exit', () => { commandProcess = null; });
  }
}

function clone() {
  console.log('Cloning repository...');
  try {
    ChildProcess.execFileSync(
        'git', ['clone', conf.repository, conf.path, '--branch', conf.branch]);
    process.chdir(conf.path);
    conf.cloned = true;
  } catch(e) {
    console.error('Failed to clone repository', e);
  }
}

function update() {
  if (commandProcess) {
    commandProcess.on('exit', () => {
      commandProcess = null;
      update();
    });
    commandProcess.kill(conf.signal);
    return;
  }

  ChildProcess.execFileSync('git', ['merge']);
  console.log('Updated.');
  startCommand();
  scheduleUpdateCheck();
}

function checkForUpdates() {
  if (!conf.cloned) {
    clone();

    if (!conf.cloned) {
      scheduleUpdateCheck(true);
      return;
    }
  }

  console.log('Checking for update...');
  try {
    ChildProcess.execFileSync('git', ['fetch']);
  } catch(e) {
    console.error('Error fetching repository', e);
    scheduleUpdateCheck(true);
    return;
  }

  var currentRev = ChildProcess.execFileSync('git', ['rev-parse', 'HEAD']).
    toString().slice(0, 40);
  var latestRev = ChildProcess.execFileSync('git', ['rev-parse', 'HEAD@{u}']).
    toString().slice(0, 40);
  console.log('Current revision: ' + currentRev);
  console.log('Latest revision: ' + latestRev);

  if (currentRev != latestRev) {
    console.log('Updating...');
    update();
  } else {
    if (!commandProcess) {
      startCommand();
    }
    scheduleUpdateCheck();
  }
}

function scheduleUpdateCheck(error) {
  var delay = 0;
  if (error) {
    if (conf.errorFrequency <= 0) {
      process.exit(1);
    }
    delay = conf.errorFrequency * 60 * 1000;
  } else if (conf.time) {
    var now = new Date();
    var hours = now.getHours();
    var minutes = now.getMinutes();

    if (hours > conf.time.hours ||
        (minutes > conf.time.minutes && hours === conf.time.hours)) {
      hours -= 12;
    }
    delay += (conf.time.hours - hours) * 60 * 60 * 1000;
    delay += (conf.time.minutes - minutes) * 60 * 1000;
  } else {
    delay = conf.frequency * 60 * 1000;
  }

  console.log('Scheduling update for ' + (delay / 1000) + ' seconds from now');
  setTimeout(checkForUpdates, delay);
}

parseArguments();

if (!validateConfiguration()) {
  console.log('Not enough or invalid arguments');
  printUsage();
  process.exit(1);
}

[`git-auto-updater starting with configuration:`,
 `repository: ${conf.repository}`,
 `branch: ${conf.branch}`,
 `path: ${conf.path}`,
 conf.time ?
   `update time: ${conf.time.hours}:${conf.time.minutes}` :
   `update frequency: ${conf.frequency} minutes`,
 `error retry frequency: ${conf.errorFrequency} minutes`].
  forEach(string => { console.log(string); });

if (conf.command) {
  var commandString = conf.command.name;
  conf.command.args.forEach(arg => { commandString += ` "${arg}"` });
  console.log(`command: ${commandString}`);
}

// Check if the path exists. If it doesn't, clone the repository, if it does,
// change into it and pull.
try {
  if (!Fs.statSync(conf.path).isDirectory()) {
    console.error('Path exists, but is not a directory. Aborting.');
    process.exit(1);
  }
  process.chdir(conf.path);

  // Make sure we're on the right branch
  try {
    ChildProcess.execFileSync('git', ['checkout', conf.branch]);
  } catch(e) {
    ChildProcess.execFileSync(
      'git', ['checkout', '-t', 'origin/' + conf.branch]);
  }

  // We appear to have cloned the repo successfully
  conf.cloned = true;
} catch(e) {
  if (e.code !== 'ENOENT') {
    console.error('Encountered an error accessing path', e);
    process.exit(1);
  }

  if (!conf.repository) {
    console.error('Failed to find repository and no repostiory URI given.');
    process.exit(1);
  }

  clone();
}

if (conf.cloned) {
  checkForUpdates();
} else {
  // If we failed to clone the repository, schedule an imminent update check
  scheduleUpdateCheck(true);
}
