const input = document.getElementById('todo-input');
const addBtn = document.getElementById('add-btn');
const todoList = document.getElementById('todo-list');

// 1. Load tasks from local storage on startup
document.addEventListener('DOMContentLoaded', getTodos);

// 2. Add a task
addBtn.addEventListener('click', () => {
    if (input.value.trim() === "") return;
    createTodoElement(input.value);
    saveLocal(input.value);
    input.value = "";
});

function createTodoElement(text) {
    const li = document.createElement('li');
    li.innerHTML = `
        <span class="todo-text">${text}</span>
        <span class="delete-btn">✕</span>
    `;
    
    // Toggle completion
    li.addEventListener('click', () => {
        li.classList.toggle('completed');
    });

    // Delete task
    li.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation(); // Prevents marking as complete when clicking delete
        li.remove();
        removeLocal(text);
    });

    todoList.appendChild(li);
}

// --- Local Storage Functions ---

function saveLocal(todo) {
    let todos = localStorage.getItem('todos') ? JSON.parse(localStorage.getItem('todos')) : [];
    todos.push(todo);
    localStorage.setItem('todos', JSON.stringify(todos));
}

function getTodos() {
    let todos = localStorage.getItem('todos') ? JSON.parse(localStorage.getItem('todos')) : [];
    todos.forEach(todo => createTodoElement(todo));
}

function removeLocal(todo) {
    let todos = JSON.parse(localStorage.getItem('todos'));
    const index = todos.indexOf(todo);
    todos.splice(index, 1);
    localStorage.setItem('todos', JSON.stringify(todos));
}