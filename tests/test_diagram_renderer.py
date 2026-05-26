from agent.services.diagram_renderer import shapes_to_tikz


class TestShapesToTikz:
    def test_empty_shapes(self):
        assert shapes_to_tikz([], []) == ""

    def test_single_rectangle(self):
        shapes = [{"type": "rectangle", "x1": 0, "y1": 0, "x2": 14, "y2": 14, "label": ""}]
        result = shapes_to_tikz(shapes, [])
        assert "\\draw[thick] (0,0) rectangle (14,14);" in result

    def test_rectangle_with_label(self):
        shapes = [{"type": "rectangle", "x1": 0, "y1": 2, "x2": 12, "y2": 14, "label": "A"}]
        result = shapes_to_tikz(shapes, [])
        assert "\\node at (6.0,8.0) {A};" in result

    def test_two_squares_diagram(self):
        shapes = [
            {"type": "rectangle", "x1": 0, "y1": 2, "x2": 12, "y2": 14, "label": "A"},
            {"type": "rectangle", "x1": 12, "y1": 0, "x2": 14, "y2": 2, "label": "B"},
            {"type": "rectangle", "x1": 0, "y1": 0, "x2": 12, "y2": 2, "label": ""},
            {"type": "rectangle", "x1": 12, "y1": 2, "x2": 14, "y2": 14, "label": ""},
        ]
        labels = [{"text": "2cm", "x": 13, "y": 8}]
        result = shapes_to_tikz(shapes, labels)
        assert "\\draw[thick] (0,0) rectangle (14,14);" in result
        assert "\\node at (6.0,8.0) {A};" in result
        assert "\\node at (13.0,1.0) {B};" in result
        assert "\\node at (13,8) {2cm};" in result

    def test_line_diagram(self):
        shapes = [
            {"type": "line", "x1": 10, "y1": 20, "x2": 100, "y2": 20, "label": "线段图"},
        ]
        labels = [
            {"text": "每天看32页", "x": 15, "y": 15},
            {"text": "还剩98页", "x": 85, "y": 15},
        ]
        result = shapes_to_tikz(shapes, labels)
        assert "\\draw (10,20) -- (100,20);" in result
        assert "\\node at (15,15) {每天看32页};" in result
        assert "\\node at (85,15) {还剩98页};" in result
