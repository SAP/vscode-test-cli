#!/usr/bin/env node
// istanbul ignore next -- can't test functions that exit the process
import { runTestsFromCommandLine } from "./vscode-tests";

// istanbul ignore next -- can't test functions that exit the process
void runTestsFromCommandLine(process.argv);
