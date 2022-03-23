import { getInput, setFailed, info } from "@actions/core";
import * as fs from "fs";
import * as childProcess from "child_process";

const customPrepare = getInput('custom-prepare', { required: false });
const customCleanup = getInput('custom-cleanup', { required: false });
const exportOnly = getInput('export-only', { required: false });
const exportScript = getInput('export-script', { required: false });

function parseArgumentsIntoArray(args: string) {
    const split = args.split(" ");
    const result: string[] = [];
    let isInString = false;

    for (let i = 0; i < split.length; i++) {       
        if (isInString) {
            result[result.length - 1] = result[result.length - 1] + split[i];
        }
        else {
            result.push(split[i]);
        }

        if (split[i].startsWith("\"")) {
            isInString = true;
        }
        
        if (split[i].endsWith("\"") && !split[i].endsWith("\\\"")) {
            isInString = false;
        }
    }

    return result;
}

async function run(): Promise<void> {
    try {
        const dependencies = getInput('dependencies', { required: true });
        const dependenciesLines = dependencies.split("\n").filter(v => v.length > 0);

        if (exportScript) {
            const dependenciesScript = __dirname + "/../dependencies.sh";
            info(`Exporting ${exportScript} script`);
            let dependenciesScriptContents = fs.readFileSync(dependenciesScript, { encoding: "utf-8" });

            if (customPrepare) {
                info(`Injecting custom prepare`);
                dependenciesScriptContents = dependenciesScriptContents.replace(/# INJECT: custom-prepare/, customPrepare);
            }

            if (customCleanup) {
                info(`Injecting custom cleanup`);
                dependenciesScriptContents = dependenciesScriptContents.replace(/# INJECT: custom-cleanup/, customCleanup);
            }

            fs.writeFileSync(exportScript, dependenciesScriptContents);
            fs.chmodSync(exportScript, 0o555);

            if (exportOnly) {
                return;
            }
        }

        if (exportOnly && !exportScript) {
            throw new Error("Missing export-script parameter value");
        }

        if (dependenciesLines.length % 2 !== 0) {
            throw new Error("Dependencies have invalid format.");
        }

        if (dependenciesLines.length === 0) {
            info(`No dependencies found`);
            return;
        }

        if (customPrepare) {
            info(`Running custom prepare`);
            const output = childProcess.execSync(customPrepare).toString("utf-8");
            info(`Custom prepare output:\n${output}`)
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
            const repo = repoBuffer.toString("utf-8").trim();
            const key = keyBuffer.toString("utf-8");

            const index = i / 2;

            info(`Adding ${repo} dependency`);

            fs.writeFileSync(`${process.env.HOME}/.ssh/github.com-repo-${index}`, key);
            fs.chmodSync(`${process.env.HOME}/.ssh/github.com-repo-${index}`, 0o400);

            fs.appendFileSync(`${process.env.HOME}/.ssh/config`,
                `Host github.com-repo-${index}\n` +
                `    Hostname github.com\n` +
                `    IdentityFile ${process.env.HOME}/.ssh/github.com-repo-${index}\n\n`)

            childProcess.execSync(`git config --global --add url."git@github.com-repo-${index}:${repo}".insteadOf https://github.com/${repo}`);
            childProcess.execSync(`git config --global --add url."git@github.com-repo-${index}:${repo}".insteadOf ssh://git@github.com/${repo}`);
        }

        const sshCommand = childProcess.execSync(`git config --local --get core.sshcommand`).toString("utf-8");

        if (sshCommand) {
            const sshCommandArgs = parseArgumentsIntoArray(sshCommand);
            const identityFile = sshCommandArgs.indexOf("-i");

            if (identityFile >= 0) {
                // If sshcommand in git config overrides identity file we need to remove it
                // otherwise our hosts in .ssh/config will not be able to use their own SSH keys
                sshCommandArgs.splice(identityFile, 2);
                childProcess.execSync(`git config --local --unset-all core.sshcommand && git config --local --add core.sshcommand '${sshCommandArgs.join(" ")}'`);
            }
        }

        info("Git config global")
        info(childProcess.execSync(`git config --global --list`).toString("utf-8"));

        info("Git config local")
        info(childProcess.execSync(`git config --local --list`).toString("utf-8"));

        info("SSH config")
        info(childProcess.execSync(`cat ~/.ssh/config`).toString("utf-8"));
    }
    catch (error) {
        setFailed(error instanceof Error ? error : (error as any).toString());
    }
}

async function cleanup(): Promise<void> {
    try {
        if (customCleanup && !exportOnly) {
            info(`Running custom cleanup`);
            const output = childProcess.execSync(customCleanup).toString("utf-8");
            info(`Custom cleanup output:\n${output}`)
        }
        else {
            info(`No cleanup needed`);
        }
    } catch (error) {
        setFailed(error instanceof Error ? error : (error as any).toString());
    }
}

if ((global as any).isCleaningUp) {
    cleanup();
}
else {
    run();
}
