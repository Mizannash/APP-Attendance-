/**
 * index.js — RN entry point (registered by AppDelegate / MainActivity).
 * No side effects beyond registration so cold start stays minimal.
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
