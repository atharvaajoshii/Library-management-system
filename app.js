const express = require("express")
const session = require('express-session')
require("dotenv").config();
const app = express();
const path = require('path')
const db = require("./db");

app.set("view engine", "ejs")
app.use(express.urlencoded({ extended: true }))
app.use(express.static("public"))
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false
    })
)



app.get('/', (req, res) => {
    res.render("login", { error: null });
})
app.post('/login', (req, res) => {
    const email = req.body.email
    const password = req.body.password
    db.get(
        `
        select * from librarians where email=? and password=?`, [email, password], (err, row) => {
        if (row) {
            req.session.librarian = row
            res.redirect("/dashboard")
        } else {
            res.render("login", { error: "invalid password" })
        }
    }
    )
})

app.get("/dashboard", isLoggedIn, (req, res) => {
    db.get(`select count(*) as totalbooks from books`, (err, books) => {
        db.get(`select count(*) as totalborrowed from borrowedbooks`, (err, borrowed) => {
            db.get(`select count(*) as totalvisits from libraryvisits`, (err, visits) => {
                db.get(`select count(*) as visitors from libraryvisits where status='IN'`, (err, visitors) => {
                    res.render("dashboard", {
                        librarian: req.session.librarian,
                        totalbooks: books.totalbooks,
                        totalborrowed: borrowed.totalborrowed,
                        totalvisits: visits.totalvisits,
                        visitors: visitors.visitors
                    })
                })
            })
        })
    })
})


function isLoggedIn(req, res, next) {
    if (req.session.librarian) {
        next();
    }
    else {
        res.redirect('/')
    }
}

app.get('/logout', (req, res) => {
    req.session.destroy(() =>
        res.redirect('/')
    )
})

app.get('/books/add',isLoggedIn, (req, res) => {
    res.render("addbook")
})

app.get('/books', isLoggedIn, (req, res) => {
    db.all(`select * from books`, (err, rows) => {
        res.render("books", { books: rows })
    })
})

app.post('/books/add', (req, res) => {
    const title = req.body.title
    const author = req.body.author
    const quantity = req.body.quantity
    db.run(
        `insert into books(title,author,quantity) values(?,?,?)`, [title, author, quantity], (err) => {
            if (!err) {
                res.redirect('/books')
            } else {
                console.log(err)
            }
        }
    )
})


app.get('/books/delete/:id', isLoggedIn, (req, res) => {
    db.run(`delete from books where id=?`, [req.params.id], (err) => {
        if (!err) {
            res.redirect("/books")
        }
    })
})

app.get('/books/edit/:id',isLoggedIn, (req, res) => {
    db.get(`select * from books where id=?`, [req.params.id], (err, row) => {
        res.render("editbook", { book: row })
    })
})

app.post('/books/edit/:id', (req, res) => {
    const title = req.body.title
    const author = req.body.author
    const quantity = req.body.quantity
    db.run(`update books set title=?,author=?,quantity=? where id=?`, [title, author, quantity, req.params.id], (err) => {
        if (!err) {
            res.redirect('/books')
        }
    })
})


app.get('/borrowedbooks',isLoggedIn, (req, res) => {
    db.all(`select * from BORROWEDBOOKS`, (err, rows) => {
        res.render("borrowedbooks", { books: rows })
    })
})

app.get('/students',isLoggedIn, (req, res) => {
    db.all(`select * from students order by usn`, (err, rows) => {
        res.render("studentrecord", { students: rows })
    })
})


app.get('/student/delete/:usn', isLoggedIn,(req, res) => {
    db.run(
        `delete from borrowedbooks where usn=?`, [req.params.usn], (err) => {
            if (err) {
                console.log(err)
            } else {
                db.run(
                    `delete from libraryvisits where usn=?`, [req.params.usn], (err) => {
                        if (err) {
                            console.log(err)
                        } else {
                            db.run(`delete from students where usn=?`, [req.params.usn], (err) => {
                                if (!err) {
                                    res.redirect("/students")
                                }
                            })
                        }
                    }
                )
            }
        }
    )
})

app.get('/borrowedbooks/returned/:usn/:bookid', isLoggedIn,(req, res) => {
    db.run(
        `update borrowedbooks set status='Returned' where bookid=? and usn=?`, [req.params.bookid, req.params.usn], (err) => {
            if (err) {
                console.log(err)
            } else {
                db.run(
                    `update books set quantity=quantity+1 where id=?`, [req.params.bookid], (err) => {
                        if (err) { console.log(err) } else {
                            res.redirect('/borrowedbooks')
                        }
                    })
            }
        }
    )
})


app.get('/studentlogin',(req, res) => {
    res.render('studentlogin', { error: null });
});


app.post('/studentlogin', (req, res) => {

    const usn = req.body.usn;
    const now = new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
    });
    db.get(`select *  from students where usn=?`, [usn], (err, row) => {
        if (!row) { res.render('studentlogin', { error: "student not found (invalid usn)" }) } else {
            db.get(
                `SELECT *
         FROM LIBRARYVISITS
         WHERE usn=?
         ORDER BY id DESC
         LIMIT 1`,
                [usn],
                (err, row) => {

                    if (!row || row.status === 'OUT') {

                        db.run(
                            `INSERT INTO LIBRARYVISITS
                     (usn, entry_time, status)
                     VALUES (?, ?, 'IN')`,
                            [usn, now],
                            () => res.redirect('/studentlogin')
                        );

                    } else {
                        const [eh, em] = row.entry_time.split(':').map(Number);
                        const [xh, xm] = now.split(':').map(Number);

                        const durationMinutes =
                            (xh * 60 + xm) -
                            (eh * 60 + em);

                        const hours = Math.floor(durationMinutes / 60);
                        const mins = durationMinutes % 60;

                        const duration =
                            hours > 0
                                ? `${hours} Hours ${mins} Min`
                                : `${mins} Min`;

                        db.run(
                            `UPDATE LIBRARYVISITS
                     SET exit_time=?,
                         status='OUT',
                         duration=?
                     WHERE id=?`,
                            [now, duration, row.id],
                            () => res.redirect('/studentlogin')
                        );

                    }
                }
            );
        }
    })
});

app.get('/books/issue/:bookid',isLoggedIn, (req, res) => {
    res.render("issueform", { error: null })
})

app.post('/books/issue/:bookid', isLoggedIn, (req, res) => {
    const bdate = new Date().toISOString().split("T")[0];
    const ret = new Date();
    ret.setDate(ret.getDate() + 15)
    const rdate = ret.toISOString().split("T")[0];
    const usn = req.body.usn;
    const bookid = req.params.bookid
    const status = 'Borrowed'
    db.get(
        `SELECT * FROM STUDENTS WHERE usn=?`,
        [usn],
        (err, student) => {

            if (!student) {
                return res.render("issueform", {
                    error: "Student does not exist"
                });
            }
            db.run(
                `insert or ignore into borrowedbooks(usn,bookid,borrow_date,return_date,status) values
        (?,?,?,?,?)`, [usn, bookid, bdate, rdate, status], function (err) {

                if (err) {
                    console.log(err)
                } else {
                    if (this.changes === 0) {
                        return res.render("issueform", {
                            error: "Already issued to this student"
                        });
                    } else {
                        db.run(
                            `update books set quantity=quantity-1 where id=? and quantity>0`, [bookid], (err) => {
                                if (err) { console.log(err) } else {
                                    console.log("books issued")
                                    res.redirect('/books')
                                }
                            }
                        )
                    }
                }
            }
            )
        })

})

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Running on port ${PORT}`);
});