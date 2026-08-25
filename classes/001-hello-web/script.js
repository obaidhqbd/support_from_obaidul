const button = document.querySelector('#pulseButton');
const status = document.querySelector('#status');
button?.addEventListener('click', () => {
  status.textContent = 'Experiment executed. Now change the code and try again.';
});
