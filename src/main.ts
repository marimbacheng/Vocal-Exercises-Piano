import './style.css';
import { mountApp } from './ui/app.ts';

const root = document.querySelector<HTMLDivElement>('#app')!;
mountApp(root, window.localStorage);
