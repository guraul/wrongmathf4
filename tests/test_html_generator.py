from agent.services.html_generator import shapes_to_jsx, generate_html


class TestShapesToJsx:
    def test_empty_questions(self):
        result = shapes_to_jsx([])
        assert result == ""

    def test_question_without_diagram(self):
        result = shapes_to_jsx([{"number": 1, "has_diagram": False}])
        assert result == ""

    def test_single_rectangle(self):
        result = shapes_to_jsx([{
            "number": 2,
            "has_diagram": True,
            "shapes": [{"type": "rect", "x1": 0, "y1": 0, "x2": 14, "y2": 14, "label": ""}],
            "labels": [],
        }])
        assert "JXG.JSXGraph.initBoard" in result
        assert "rectangle" not in result  # uses polygon, not rectangle
        assert "(0,0)" in result or "[0,0]" in result

    def test_rect_with_label_and_line(self):
        result = shapes_to_jsx([{
            "number": 3,
            "has_diagram": True,
            "shapes": [
                {"type": "rect", "x1": 0, "y1": 2, "x2": 12, "y2": 14, "label": "A"},
                {"type": "line", "x1": 0, "y1": 0, "x2": 14, "y2": 0, "label": "数轴"},
            ],
            "labels": [{"text": "2cm", "x": 13, "y": 8}],
        }])
        assert "A" in result
        assert "2cm" in result
        assert "segment" in result
        assert "polygon" in result


class TestGenerateHtml:
    def test_generates_valid_html(self):
        result = {
            "subject": "数学",
            "questions": [
                {"number": 1, "content": "1+1=?", "has_diagram": False, "shapes": [], "labels": []},
                {"number": 2, "content": "如图", "has_diagram": True, "shapes": [
                    {"type": "rect", "x1": 0, "y1": 0, "x2": 10, "y2": 10, "label": "A"}
                ], "labels": []},
            ],
        }
        html = generate_html(result)
        assert "<!DOCTYPE html>" in html
        assert "katex" in html.lower()
        assert "JSXGraph" in html
        assert 'qnum' in html
        assert '###' in html
        assert "board.create" in html
        assert "A" in html
