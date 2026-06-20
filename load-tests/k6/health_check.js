import http from 'k6/http';
import { sleep } from 'k6';

export let options = {
  vus: 20,
  duration: '30s',
};

export default function () {
  http.get('http://127.0.0.1:8000/api/health');
  sleep(0.5);
}
