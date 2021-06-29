#!/bin/bash
set -e

cleanup() {
    echo "Removing .dependencies"
    rm -rf .dependencies
    git config --unset --global core.sshCommand
}

if [ -z "$DEPENDENCIES" ]; then
    echo "No DEPENDENCIES env variable was set."
    exit 1
fi

if [ ! -d ".dependencies" ]; then
    echo "Creating .dependencies directory"
    mkdir -p .dependencies
fi

trap cleanup INT TERM EXIT

echo "Loading dependencies..."

DEP_COUNT=$(echo $DEPENDENCIES | wc -w)
DEP_COUNT=$(expr $DEP_COUNT / 2)

echo "Found $DEP_COUNT dependencies"

INDEX=0

# DEPENDECIES should contain repo names and keys in format defined below
#   basr64: org/repo
#   base64: key
#   base64: org/repo2
#   base64: key
#   ...

git config --global core.sshCommand "ssh -o StrictHostKeyChecking=no -F $PWD/.dependencies/ssh-config"

echo "$DEPENDENCIES" > .dependencies/DEPENDENCIES

while IFS= read -r REPO; do
    if [ -z "$REPO" ]; then
        continue
    fi

    REPO=$(echo "$REPO" | base64 -d)

    echo Adding $REPO dependency
    IFS= read -r KEY

    if [ -z "$KEY" ]; then
        echo "Missing key for $REPO dependency";
        exit 1
    fi

    INDEX=$(expr $INDEX + 1)

    echo "$KEY" | base64 -d > .dependencies/github.com-repo-$INDEX
    chmod 0400 .dependencies/github.com-repo-$INDEX

    echo "Host github.com-repo-$INDEX" >> .dependencies/ssh-config
    echo "    Hostname github.com" >> .dependencies/ssh-config
    echo "    IdentityFile $PWD/.dependencies/github.com-repo-$INDEX" >> .dependencies/ssh-config
    echo "" >> .dependencies/ssh-config

    git config --global --add url."git@github.com-repo-$INDEX:$REPO".insteadOf https://github.com/$REPO
    git config --global --add url."git@github.com-repo-$INDEX:$REPO".insteadOf ssh://git@github.com/$REPO
done < .dependencies/DEPENDENCIES

echo "Git config"
git config --global --list

echo "SSH config"
cat $PWD/.dependencies/ssh-config

$@
