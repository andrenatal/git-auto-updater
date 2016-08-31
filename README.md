# git-auto-updater

```
usage: git-auto-updater [options] [-- [command]]

Periodically checks a git repository for updates and runs a command
between updates.

options:
  -h, --help          print this message
  -r, --repository    git repository URI
  -b, --branch        git branch (Default: master)
  -p, --path          local clone path (Default: repository name)
  -f, --frequency     update check frequency, in minutes (Default: 1440)
  -t, --time          update check time, overrides frequency, HHMM (e.g. 0200)
  -s, --signal        signal to terminate command (Default: SIGINT)
  -e, --error-retry   update check frequency after an error, in minutes.
                      Specifying zero exits on errors. (Default: 5)
  --                  stop processing command line arguments
```
