# ORM
_(I don't really know what else to call it)_

## Description
A MySQL database helper class for Javascript. My aim was to reduce the number of network calls in case of slow traffic or overloaded server

## Conventions
The PK of the table is usually 'id', but you can have anything
The name of the JS object is usually the name of the first MySQL table. This makes coding easier because you're calling it by the same name
The order of operations is: construct, join, load, union, squash, get/set, save

## Examples
### Basic
```
//get a product code from the db
const product = new ORM('product', 'productcode', 'file:7');
product.load('productcode', 'RR013840_0001'); //SELECT * FROM product WHERE productcode = 'RR013840_0001'
console.log(product);

//print description of product
const description = product.get('description'); //all columns of product table are already loaded into memory, so there is no need for another network call to the db
console.log(description);

//update selling price
product.set('sellingprice', 99.99); //does not update MySQL (yet)
console.log(product);

//now save it back to db
product.save(); //now that all is said and done, update MySQL
console.log(product);
```
### Advanced loading
```
//load multiple items
const calendar = new ORM('calendar', 'id', 'file:22');
calendar.load({
  where: 'status != ? and status != ? and jobcat = ? and position > ? and jobid is not null',
  params: ['Complete', 'Deleted', 'BIKE', 10],
  columns: ['jobid', 'position'],
}); //SELECT jobid, position FROM calendar WHERE status != 'Complete' AND status != 'Deleted' AND jobcat = 'BIKE' AND position > 10 AND jobid IS NOT NULL
const positions = calendar.get('position'); //this is an array
console.log(positions); //[20, 30, 40]
console.log(calendar); //will output a table of the data
```
## Methods

### Constructor
Creates a new instance of the dataset. You can have as many as client memory allows :)
#### Parameters
`table`: This is the name of the MySQL table to query
`pk`: This is the name of the primary key. If you omit this, there will be another database call to get the PK. Having the name of the PK already in here will make it faster
`info`: Purely for debugging. Useful to have the name of the file where you are calling from and also the line number
#### Example
````
const calendar = new ORM('calendar', 'id', 'file:22');
````

### `.getPK`
Gets the name of the primary key of the given table
#### Example
```
const table = new ORM('table'); //note PK parameter is missing
console.log(table.getPK);
```

### `.join`
Joins another table to the dataset	
This will take the existing table (artwork) and add the user table to the dataset. The join will be on user.id = artwork.created_by
#### Parameters:
`table`: The name of the new table to join
`left`: Join condition 1 (the table you're joining)
`right`: Join condition 2 (the original table)
`type`: The join type e.g. inner, left, right, etc. Defaults to 'inner'
#### Example
```
const artwork = new ORM('artwork', 'id', 'file:7');
artwork.join('user', 'id', 'created_by', 'inner');
```

### `.load`
Loads data from the database via SELECT query
Data is stored in the ORM object, use .get() to do stuff with the data
If using curdate(), curtime() or now() then put that in the sql and NOT the params (clientip() and serverip() can go in the params)
#### Parameters:
`where`: Where clause, including placeholders (this is the only required parameter)
`params`: Data to replace ? placeholders
`columns`: The columns to return for SELECT. Defaults to *
`sort`: Columns to sort (order) by
`group`: GROUP BY these columns
`limit`: LIMIT to this number of rows
`tableIndex`: orm.table is an array, this selects which one. Defaults to 0. Used with .union()
`async`: Synchronous or asynchronous ajax call. Sometimes the program will run before the data has come back from server
#### Example
```
const customer = new ORM('customer', 'id', 'file:7');
customer.load('customercode', $('#custcode').val(), 'emailinvoice'); //SELECT emailinvoice FROM customer WHERE customercode = :custcode
```

### `.union`
Similar to `.load`, union adds more data from another table (dont confuse with `.join`)
#### Parameters
`table`: Table name to union
`where`: Where clause, including placeholders
`params`: Data to replace ? placeholders
`columns`: Optional columns to return for SELECT. Defaults to *
	
### `.squash`
Squashes column data down to 1 row. Used after `.union`
#### Parameters
`ignore`: The column(s) to ignore
#### Example
[['RR012345_0011', 1, 0, 79.95],['RR012345_0011', 0, 1, 0]] will go to ['RR012345_0011', 1, 1, 79.95]

### `.get`	 
This will return an array containing a column data
#### Parameters
`colName`: The name of the column to return, if empty returns all of the data
#### Examples
```	 
const bar = foo.get('bar');
if (bar == 1) { //true
	$('#bar').val(bar);
}
```
To loop, use:
```
const status = warranty_status.get('status');
for (let index in status) {
	console.log(status[index]);
}
//or
status.forEach((element) => { //single column
	console.log(element);
});
```

### `.set`
Sets a value in the 2D array
You can also use special values like: now(), curdate(), curtime(), clientip(), serverip()
#### Parameters
`colName`: Column label
`value`: The value to set
`rowIndex`: Row number. Defaults to 0
#### Examples
`invoiceline.set('updated', 1);`
`logfile.set('current_datetime', 'now()');`
`payment_lines.set('terminal_ip', 'clientip()');`

### `.save`
Saves data to database (update or insert query)
For UPDATE, use `.load()` first then `.set()` then `.save()`
For INSERT, use `.set()` first then `.save()` without `.load()`ing any data
#### Examples
Update existing
````
const branchxfer_full = new ORM('branchxfer_full', 'id', 'storecc');
branchxfer_full.load('transref', stno, 'receiptedDateTime'); //SELECT id, receiptedDateTime FROM branchxfer_full WHERE 'transref' = :stno
branchxfer_full.set('receiptedDateTime', 'now()'); //UPDATE branchxfer_full SET receiptedDateTime = now()
branchxfer_full.save(); //will update existing, becasue value of pk exists
````
Insert new
```
const branchxfer_full = new ORM('branchxfer_full', 'id', 'storecc');
branchxfer_full.set('receiptedDateTime', 'now()'); //INSERT INTO branchxfer_full (receiptedDateTime) VALUES (now())
branchxfer_full.save(); //will insert new, pk does not exist
```

### `.delete`
Deletes rows in a table
#### Parameters
`where`: Where clause, including placeholders
`params`: Data to replace ? placeholders

### `.rawSQL`
Runs raw SQL queries. Is my ORM not good enough for ya?
#### Parameters
`sql`: SQL string, including placeholders (?)
`params`: Replace ? with these parameters in the SQL string
`async`: Whether the request is synchronous or asynchronous

### `.numRows`
Counts number of rows in data

### `.isEmpty`
Checks to see if the data is empty or not. Dont confuse with `orm._empty(val)`

### `.getError`
Shows the last error message

### `.toString`
Every object needs this, right. Converts from JS object to a string
