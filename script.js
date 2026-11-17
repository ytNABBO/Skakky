const board = document.getElementById("board");

for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
        const square = document.createElement("div");
        square.classList.add("square");

        const color = (row + column) % 2 === 0 ? "light" : "dark";
        square.classList.add(color);

        board.appendChild(square);
    }
}

document.getElementById("status").textContent = "Chessboard ready. Pieces coming next.";
