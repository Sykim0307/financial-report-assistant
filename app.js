// 화면 뼈대 (태스크 1): 화면 전환 내비게이션만 구현. localStorage/Claude API 연동은 다음 태스크에서 추가.

const navButtons = document.querySelectorAll(".nav-btn");
const screens = document.querySelectorAll(".screen");

function showScreen(targetId) {
  screens.forEach((screen) => {
    screen.classList.toggle("active", screen.id === targetId);
  });
  navButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.target === targetId);
  });
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => showScreen(btn.dataset.target));
});

showScreen("input-screen");
