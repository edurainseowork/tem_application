const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Ignore backend, cms, git, and pnpm store metadata so Metro bundler stays lightweight & fast
config.resolver.blockList = [
  /Backend\/.*/,
  /CMS-Portal\/.*/,
  /\.git\/.*/,
  /\.idea\/.*/,
  /\.gsd\/.*/,
  /node_modules\/\.pnpm\/.*/,
  /node_modules\/.*\/node_modules\/.*/
];

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
