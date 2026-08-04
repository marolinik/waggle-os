import { armBootConnection } from './boot-connect';

armBootConnection();
void import('./app-entry').then(({ mountApp }) => mountApp());
