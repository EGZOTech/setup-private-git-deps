import { getInput, setFailed, info } from "@actions/core";
import * as fs from "fs";
import * as childProcess from "child_process";

async function run(): Promise<void> {
    try {
        const dependencies = getInput('dependencies', { required: true });
        const dependenciesLines = dependencies.split("\n").filter(v => v.length > 0);

        if (dependenciesLines.length % 2 !== 0) {
            throw new Error("Dependencies have invalid format.");
        }

        info(`Found ${dependenciesLines.length / 2} dependencies`);
        const sshDir = `${process.env.HOME}/.ssh`;

        if (!fs.existsSync(sshDir)) {
            info(`Creating ${sshDir} directory`);
            fs.mkdirSync(sshDir, { recursive: true });
        }

        childProcess.execSync(`ssh-keyscan github.com >> ~/.ssh/known_hosts`);

        for (let i = 0; i < dependenciesLines.length; i += 2) {
            const repoBuffer = Buffer.from(dependenciesLines[i], "base64");
            const keyBuffer = Buffer.from(dependenciesLines[i + 1], "base64");
            const repo = repoBuffer.toString("utf-8");
            const key = keyBuffer.toString("utf-8");

            const index = i / 2;

            info(`Adding ${repo} dependency`);

            fs.writeFileSync(`~/.ssh/github.com-repo-${index}`, key);
            fs.chmodSync(`~/.ssh/github.com-repo-${index}`, 0o400);

            fs.appendFileSync(`~/.ssh/config`,
                `Host github.com-repo-${index}\n` +
                `    Hostname github.com\n` +
                `    IdentityFile ${process.env.HOME}/.ssh/github.com-repo-${index}\n\n`)

            childProcess.execSync(`git config --global --add url."git@github.com-repo-${index}:${repo}".insteadOf https://github.com/${repo}`);
            childProcess.execSync(`git config --global --add url."git@github.com-repo-${index}:${repo}".insteadOf ssh://git@github.com/${repo}`);
        }

        info("Git config")
        info(childProcess.execSync(`git config --global --list`).toString("utf-8"));

        info("SSH config")
        info(childProcess.execSync(`cat ~/.ssh/config`).toString("utf-8"));
    }
    catch (error) {
        setFailed(error.message);
    }
}

run();
